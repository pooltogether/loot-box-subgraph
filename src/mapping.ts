import { BigInt, log , Address, store} from "@graphprotocol/graph-ts"
import {
  ERC721ControlledCreated, ERC721ControlledFactory
} from "../generated/ERC721ControlledFactory/ERC721ControlledFactory"

import {ERC20, Transfer} from "../generated/ERC20/ERC20"
import {Transfer as ERC721Transfer, ERC721 as ERC721Contract} from "../generated/ERC721/ERC721"

import { ERC20Balance, Lootbox, ERC20 as ERC20Entity, ERC721 , ERC721Token, ERC1155 as ERC1155Entity, ERC1155Balance} from "../generated/schema"

import {ERC721Controlled as ERC721ControlledTemplate } from "../generated/templates"
import { LootboxController } from "../generated/templates/ERC721Controlled/LootboxController"
import {TransferBatch, TransferSingle, ERC1155} from "../generated/ERC1155/ERC1155"

const LOOTBOX_CONTROLLER_ADDRESS : string = "0x51cf8623d75C27884AD83e8d5dEFE7F758647Aac"
const ZERO_ADDRESS = Address.fromHexString("0x0000000000000000000000000000000000000000")

// 
export function handleERC721ControlledCreated(event: ERC721ControlledCreated): void {
  log.warning("creating a new erc721 (lootbox=true) at {} \n \n \n ",[event.params.token.toHex()] )
  let erc721 = new ERC721(event.params.token.toHex()) 
  const erc721Contract = ERC721Contract.bind(event.params.token)
  erc721.name = erc721Contract.try_name().value
  erc721.uri = erc721Contract.try_baseURI().value
  erc721.isLootBox = true
  erc721.save()
}


// global "external" erc20 transfer
export function handleERC20Transfer(event: Transfer) : void { 
  // get to and from fields from event
  const to = event.params.to
  const from = event.params.from
  const amount = event.params.value
  const erc20Address = event.address

  // if erc20 does not exist in store - create it 
  if(ERC20Entity.load(erc20Address.toHex()) == null){
    let erc20Contract = ERC20.bind(erc20Address)
    let erc20 = new ERC20Entity(erc20Address.toHex())
    erc20.name = erc20Contract.try_name().value
    erc20.symbol = erc20Contract.try_symbol().value
    erc20.decimals = BigInt.fromI32(erc20Contract.try_decimals().value)
    erc20.save()
  }

  // load lootbox entity corresponding to the to/from address
  const lootboxTo = Lootbox.load(to.toHex())
  
  // if erc20 transfer is TO the lootbox address we increment the balance of the lootbox
  if(lootboxTo != null) {   
    let erc20balance = ERC20Balance.load(generateCompositeId(lootboxTo.id , erc20Address.toHex())) 
    if(erc20balance == null) { // create ERC20Balance 
      log.warning("create new erc20 case ",[])
      erc20balance = new ERC20Balance(generateCompositeId(lootboxTo.id , erc20Address.toHex()))
      erc20balance.balance = amount
      erc20balance.erc20 = erc20Address.toHex()
      erc20balance.lootbox = lootboxTo.id
      erc20balance.save()
    }
    else { // update case
      log.warning("erc20 update case ",[])
      const existingErc20balance = erc20balance.balance
      erc20balance.balance = existingErc20balance.plus(amount)
      erc20balance.save()
    }
    //lootboxTo.save()
  }


  // erc20 transfer FROM lootbox decrement balance
  let lootboxFrom = Lootbox.load(from.toHex())
  if(lootboxFrom != null) {
    log.warning("erc20transfer FROM lootbox id  {}",[lootboxFrom.id])
    // if its a ERC20 transfer from the Lootbox to an outside address then the ERC20 should exist
    let erc20balance = ERC20Balance.load(generateCompositeId(lootboxFrom.id, erc20Address.toHex()))
    log.warning("erc20 balance id {} ", [erc20balance.id])
    const existingBalance = erc20balance.balance
    erc20balance.balance = existingBalance.minus(amount)
    if(erc20balance.balance.equals(new BigInt(0))){
      log.warning("removing erc20 balance ",[])
      store.remove("ERC20Balance", erc20balance.id)
    }
    else{
      erc20balance.save()
    }
  }
}




// global "external" erc721 Transfer event
export function handleERC721Transfer(event: ERC721Transfer) : void {
  // get to and from fields from event
  
  const to = event.params.to
  const from = event.params.from
  const tokenId = event.params.tokenId

  const erc721Address = event.address
  log.warning("erc721 handler for erc721 {}",[erc721Address.toHex()])

  // load ERC721 entity
  let erc721 = ERC721.load(erc721Address.toHex())
  if(erc721 == null){ // we need to create  this entity
    erc721 = new ERC721(erc721Address.toHex())
    log.warning("creating erc721 ",[])
    const erc721Contract = ERC721Contract.bind(erc721Address)
    erc721.name = erc721Contract.try_name().value
    erc721.uri = erc721Contract.try_baseURI().value
    erc721.isLootBox = false
    erc721.save()
  }
  // if this erc721 is a lootbox and has just been minted
  if(erc721.isLootBox && from.equals(ZERO_ADDRESS)){
    let lootboxControllerContract = LootboxController.bind(Address.fromString(LOOTBOX_CONTROLLER_ADDRESS))
    const lootBoxAddress = lootboxControllerContract.try_computeAddress(erc721Address, tokenId).value
    log.warning("creating a lootbox entity at {} ", [lootBoxAddress.toHex()])
    let lootbox = new Lootbox(lootBoxAddress.toHex())
    lootbox.tokenId = tokenId
    lootbox.erc721 = erc721Address
    lootbox.save()
  }

  // case where ERC721 is transfered OUT of lootbox - before TO so can delete if applicable
  let lootboxFrom = Lootbox.load(from.toHex())
  if(lootboxFrom != null) {
    log.warning("Transfer FROM lootbox {} ", [lootboxFrom.id])
    let erc721token = ERC721Token.load(generateCompositeId(erc721.id,tokenId.toHex()))
    store.remove("ERC721Token", erc721token.id)
  }

  // erc721 transferred INTO lootbox
  let lootboxTo = Lootbox.load(to.toHex())
  if(lootboxTo != null) { // add erc721 to ERC721 collection
    log.warning("Transfer TO lootbox {} ", [lootboxTo.id])
    let erc721token = ERC721Token.load(generateCompositeId(erc721.id, tokenId.toHex()))
    if(erc721token == null ) {
      log.warning("creating erc721 token as didnt exist for id {} ", [generateCompositeId(erc721.id, tokenId.toHex())])
      erc721token = new ERC721Token(generateCompositeId(erc721.id, tokenId.toHex()))
      erc721token.tokenId = tokenId
      erc721token.erc721 =  erc721.id
      erc721token.lootbox = to.toHex()
      erc721token.save()
    }
    else { //update existing erc721
      erc721token.lootbox = to.toHex()
      erc721token.save()
    }   
  }
}

// global "external" erc1155 TransferSingle event
export function handleTransferSingle(event: TransferSingle) : void {
  //extract data fields from event
  const from = event.params.from
  const to = event.params.to
  const tokenId = event.params.id
  const value = event.params.value
  
  const erc1155Address = event.address

  // check if ERC1155 entity exists, if null create
  let erc1155 = ERC1155Entity.load(erc1155Address.toHex())
  if(erc1155 == null) { 
    erc1155 = new ERC1155Entity(erc1155Address.toHex())
    erc1155.save()
  }

  const lootboxTo = Lootbox.load(to.toHex())
  // case where ERC1155 is transferred TO the lootbox
  if(lootboxTo != null) { //add value to balance
    let erc1155Balance = ERC1155Balance.load(generateCompositeTokenId(erc1155.id, tokenId, lootboxTo.id))
    if(erc1155Balance == null){ // we need to create an ERC1155Balance entity
      erc1155Balance = new ERC1155Balance(generateCompositeTokenId(erc1155.id, tokenId, lootboxTo.id))
      erc1155Balance.tokenId = tokenId
      erc1155Balance.balance = value
      erc1155Balance.erc1155 = erc1155Address.toHex() 
      erc1155Balance.lootbox = lootboxTo.id 
      erc1155Balance.save()
    }
    else { // already exists - update
      const existingBalance = erc1155Balance.balance
      erc1155Balance.balance = existingBalance.plus(value)
      erc1155Balance.save()
    }
  }
  // check against FROM field
  const lootboxFrom = Lootbox.load(from.toHex())
  if(lootboxFrom != null) { // // reduce from balance
    let erc1155Balance = ERC1155Balance.load(generateCompositeTokenId(erc1155.id, tokenId, lootboxFrom.id))
    const existingBalance = erc1155Balance.balance
    erc1155Balance.balance = existingBalance.minus(value)
    if(erc1155Balance.balance.equals(new BigInt(0))){
      log.warning("deleting erc1155 zero balance ",[])
      store.remove("ERC1155Balance", erc1155Balance.id)
    }
    else {
      erc1155Balance.save()
    }
  }
}


// global "external" erc1155 TransferBatch event
export function handleTransferBatch(event : TransferBatch) : void {
  
  const from = event.params.from
  const to = event.params.to
  const tokenIds = event.params.ids
  const values= event.params.values

  const erc1155Address = event.address

  // check against TO field
  const lootboxTo = Lootbox.load(to.toHex())
  
  log.warning("handleTransferBatch for lootboxId {} ",[lootboxTo.id])
  if(lootboxTo != null) {
    let erc1155 = ERC1155Entity.load(erc1155Address.toHex())
    
    if(erc1155 == null) { 
      let erc1155 = new ERC1155Entity(erc1155Address.toHex())
      erc1155.save()
    }

    for(let i = 0 , len = values.length; i <len; i++){
      // check if ERC1155 entity exists, if null create
      let erc1155Balance = ERC1155Balance.load(generateCompositeTokenId(erc1155.id, tokenIds[i], lootboxTo.id))
      if(erc1155Balance == null) {
        log.warning("creating erc1155 balance ",[])
        erc1155Balance = new ERC1155Balance(generateCompositeTokenId(erc1155.id, tokenIds[i], lootboxTo.id))
        erc1155Balance.tokenId = tokenIds[i]
        erc1155Balance.balance = values[i]
        erc1155Balance.erc1155 = erc1155Address.toHex()
        erc1155Balance.lootbox = lootboxTo.id
        erc1155Balance.save()
      }
      else {        
        const existingBalance = erc1155Balance.balance
        erc1155Balance.balance = existingBalance.plus(values[i])
        erc1155Balance.save()
      }
    }
  }
  
  // check against FROM field
  const lootboxFrom = Lootbox.load(from.toHex())

  if(lootboxFrom != null) {
    let erc1155 = ERC1155Entity.load(erc1155Address.toHex())
    if(erc1155 == null) { 
      erc1155 = new ERC1155Entity(erc1155Address.toHex())
      erc1155.save()
    }
    // reduce the balance of each of these from the array
    for(let i = 0 , len = values.length; i <len; i++){
      let erc1155Balance = ERC1155Balance.load(generateCompositeTokenId(erc1155.id, tokenIds[i], lootboxFrom.id))
      const existingBalance = erc1155Balance.balance
      erc1155Balance.balance = existingBalance.minus(values[i])
      if(erc1155Balance.balance.equals(new BigInt(0))){
        log.warning("deleting erc1155 zero balance ",[])
        store.remove("ERC1155Balance", erc1155Balance.id)
      }
      else {
        erc1155Balance.save()
      }    
    } 
  }
}

// helper functions
function generateCompositeId(ercId: string , lootboxId : string) : string{
  return ercId + "-" +lootboxId
}
function generateCompositeTokenId(ercId: string, tokenId: BigInt, lootboxId: string): string {
  return ercId + "-" + tokenId.toHex() + "-" + lootboxId
}