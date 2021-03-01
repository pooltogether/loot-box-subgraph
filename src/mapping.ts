import { BigInt, log, Address, store } from '@graphprotocol/graph-ts'
import { ERC721ControlledCreated } from '../generated/ERC721ControlledFactory/ERC721ControlledFactory'

import { ERC20, Transfer } from '../generated/ERC20/ERC20'
import {
  Transfer as ERC721Transfer,
  ERC721 as ERC721Contract
} from '../generated/ERC721/ERC721'

import {
  ERC20Balance,
  LootBox,
  ERC20Entity,
  ERC721Entity,
  ERC721Token,
  ERC1155Entity,
  ERC1155Balance
} from '../generated/schema'
import { LootBoxController } from '../generated/ERC721ControlledFactory/LootBoxController'
import { TransferBatch, TransferSingle } from '../generated/ERC1155/ERC1155'

import {LOOTBOX_CONTROLLER_ADDRESS} from "./constants"
const ZERO_ADDRESS = Address.fromHexString(
  '0x0000000000000000000000000000000000000000'
)

export function handleERC721ControlledCreated(
  event: ERC721ControlledCreated
): void {
  let erc721 = new ERC721Entity(event.params.token.toHex())
  log.warning("controlled created at {} ",[erc721.id])
  const erc721Contract = ERC721Contract.bind(event.params.token)
  let erc721NameCall = erc721Contract.try_name()
  if (erc721NameCall.reverted) {
    log.info('ERC721 Name call reverted', [])
  } else {
    erc721.name = erc721NameCall.value
  }
  let erc721UriCall = erc721Contract.try_baseURI()
  if (erc721UriCall.reverted) {
    log.info('ERC721 Base Uri call reverted ', [])
  } else {
    erc721.uri = erc721UriCall.value
  }
  erc721.isLootBox = true
  erc721.save()
}

function loadOrCreateERC20Entity(erc20Address: Address) : ERC20Entity{
  let erc20Contract = ERC20.bind(erc20Address)
  let erc20 = new ERC20Entity(erc20Address.toHex())
  let tryNameCallResult = erc20Contract.try_name()
  if (tryNameCallResult.reverted) {
    log.info('ERC20 try_name() call reverted', [])
  } else {
    erc20.name = tryNameCallResult.value
  }
  let trySymbolCallResult = erc20Contract.try_symbol()
  if (trySymbolCallResult.reverted) {
    log.info('ERC20 try_symbol() call reverted', [])
  } else {
    erc20.symbol = trySymbolCallResult.value
  }
  let tryDecimalsCallResult = erc20Contract.try_decimals()
  if (tryDecimalsCallResult.reverted) {
    log.info('ERC20 try_decimals() call reverted', [])
  } else {
    erc20.decimals = BigInt.fromI32(tryDecimalsCallResult.value)
  }
  erc20.save()
  return erc20 as ERC20Entity
}

// global "external" erc20 transfer
export function handleERC20Transfer(event: Transfer): void {
  // get to and from fields from event
  const to = event.params.to
  const from = event.params.from
  const amount = event.params.value
  const erc20Address = event.address



  if(to.equals(from)){ // if token transfer is to same address ignore
    return;
  }

  if(amount.equals(new BigInt(0))){
    return;
  }



  // load lootbox entity corresponding to the to/from address
  const lootboxTo = LootBox.load(to.toHex())
  
  // if erc20 transfer is TO the lootbox address we increment the balance of the lootbox
  if (lootboxTo != null) {
    // if erc20 does not exist in store - create it
    let erc20Entity = loadOrCreateERC20Entity(erc20Address)
    
    let erc20Balance = ERC20Balance.load(
      generateCompositeId(lootboxTo.id, erc20Entity.id)
    )
    if (erc20Balance == null) {
      // create ERC20Balance
      erc20Balance = new ERC20Balance(
        generateCompositeId(lootboxTo.id, erc20Entity.id)
      )
      erc20Balance.balance = amount
      erc20Balance.erc20Entity = erc20Entity.id
      erc20Balance.lootbox = lootboxTo.id
      erc20Balance.save()
    } else {
      // update case
      const existingErc20balance = erc20Balance.balance
      erc20Balance.balance = existingErc20balance.plus(amount)
      erc20Balance.save()
    }
  }

  // erc20 transfer FROM lootbox decrement balance
  let lootboxFrom = LootBox.load(from.toHex())
  if (lootboxFrom != null) {
    // if its a ERC20 transfer from the Lootbox to an outside address then the ERC20 should already exist
    let erc20Balance = ERC20Balance.load(
      generateCompositeId(lootboxFrom.id, erc20Address.toHex())
    )

    if(erc20Balance == null && amount.equals(new BigInt(0))){
      // zero value transfer out - double plunder?
      return;
    }

    const existingBalance = erc20Balance.balance 
    erc20Balance.balance = existingBalance.minus(amount)
    if (erc20Balance.balance.equals(new BigInt(0))) {
      store.remove('ERC20Balance', erc20Balance.id)
    } else {
      erc20Balance.save()
    }
  }
}

function loadOrCreateERC721Entity(erc721Address : Address): ERC721Entity{
  let erc721 = ERC721Entity.load(erc721Address.toHex())
  if(erc721 == null){
    erc721 = new ERC721Entity(erc721Address.toHex())
    const erc721Contract = ERC721Contract.bind(erc721Address)
    let erc721NameCall = erc721Contract.try_name()
    if (erc721NameCall.reverted) {
      log.warning('ERC721 try_name() call reverted', [])
    } else {
      erc721.name = erc721NameCall.value
    }
    let erc721baseUrlCall = erc721Contract.try_baseURI()
    if (erc721baseUrlCall.reverted) {
      log.info('ERC721 try_baseUrl call reverted', [])
    } else {
      erc721.uri = erc721baseUrlCall.value
    }
    erc721.isLootBox = false
    erc721.save()
  }
  return erc721 as ERC721Entity
}

// global "external" erc721 Transfer event
export function handleERC721Transfer(event: ERC721Transfer): void {
  const to = event.params.to
  const from = event.params.from
  const tokenId = event.params.tokenId

  const erc721Address = event.address

  // loadOrCreate ERC721 entity if applicable
  let erc721 = ERC721Entity.load(erc721Address.toHex())
  
  // if this erc721 is a lootbox and has just been minted
  if (!!erc721 && erc721.isLootBox && from.equals(ZERO_ADDRESS)) {
    let lootboxControllerContract = LootBoxController.bind(
      Address.fromString(LOOTBOX_CONTROLLER_ADDRESS)
    )
    log.warning("we have created a lootbox!! zzz txId {}", [event.transaction.hash.toHex()])
    let computeAddressCall = lootboxControllerContract.try_computeAddress(
      erc721Address,
      tokenId
    )
    let lootBoxAddress: Address
    if (computeAddressCall.reverted) {
      log.error('LootboxController compute address call reverted! ', [])
    } else {
      lootBoxAddress = computeAddressCall.value
    }
    let lootbox = new LootBox(lootBoxAddress.toHex())
    lootbox.tokenId = tokenId
    lootbox.erc721 = erc721Address
    lootbox.save()
  }

  if(from.equals(to)){// if token transfer is to same address ignore
    return;
  }

  // case where ERC721 is transfered OUT of lootbox - before TO so can delete if applicable
  let lootboxFrom = LootBox.load(from.toHex())
  if (lootboxFrom != null) {
    let erc721token = ERC721Token.load(
      generateCompositeId(erc721.id, tokenId.toHex())
    )
    store.remove('ERC721Token', erc721token.id)
  }

  // erc721 transferred INTO lootbox
  let lootboxTo = LootBox.load(to.toHex())
  if (lootboxTo != null) {
    erc721 = loadOrCreateERC721Entity(event.address)
    // add erc721 to ERC721 collection
    let erc721token = ERC721Token.load(
      generateCompositeId(erc721.id, tokenId.toHex())
    )
    if (erc721token == null) {
      erc721token = new ERC721Token(
        generateCompositeId(erc721.id, tokenId.toHex())
      )
      erc721token.tokenId = tokenId
      erc721token.erc721Entity = erc721.id 
      erc721token.lootbox = to.toHex()
      erc721token.save()
    } else {
      //update existing erc721
      erc721token.lootbox = to.toHex()
      erc721token.save()
    }
  }
}


// check if ERC1155 entity exists, if null create
function loadOrCreateERC1155(erc1155Address : Address) : ERC1155Entity{
  let erc1155 = ERC1155Entity.load(erc1155Address.toHex())
  if(!erc1155){
    erc1155 = new ERC1155Entity(erc1155Address.toHex())
    erc1155.save()
  }
  return erc1155 as ERC1155Entity
}


// global "external" erc1155 TransferSingle event
export function handleTransferSingle(event: TransferSingle): void {
  //extract data fields from event
  const from = event.params.from
  const to = event.params.to
  const tokenId = event.params.id
  const value = event.params.value

  const erc1155Address = event.address
  const lootboxTo = LootBox.load(to.toHex())
  
  if(to.equals(from)){ // ignore if transfer to equals from
    return;
  }

  // case where ERC1155 is transferred TO the lootbox
  if (lootboxTo != null) {
    let erc1155 = loadOrCreateERC1155(erc1155Address)
    //add value to balance
    let erc1155Balance = ERC1155Balance.load(
      generateCompositeTokenId(erc1155.id, tokenId, lootboxTo.id)
    )
    if (erc1155Balance == null) {
      // we need to create an ERC1155Balance entity
      erc1155Balance = new ERC1155Balance(
        generateCompositeTokenId(erc1155.id, tokenId, lootboxTo.id)
      )
      erc1155Balance.tokenId = tokenId
      erc1155Balance.balance = value
      erc1155Balance.erc1155Entity = erc1155Address.toHex()
      erc1155Balance.lootbox = lootboxTo.id
      erc1155Balance.save()
    } else {
      // already exists - update
      const existingBalance = erc1155Balance.balance
      erc1155Balance.balance = existingBalance.plus(value)
      erc1155Balance.save()
    }
  }
  // check against FROM field
  const lootboxFrom = LootBox.load(from.toHex())
  if (lootboxFrom != null) {
    // // reduce from balance
    let erc1155Balance = ERC1155Balance.load(
      generateCompositeTokenId(erc1155Address.toHex(), tokenId, lootboxFrom.id)
    )
    const existingBalance = erc1155Balance.balance
    erc1155Balance.balance = existingBalance.minus(value)
    if (erc1155Balance.balance.equals(new BigInt(0))) {
      store.remove('ERC1155Balance', erc1155Balance.id)
    } else {
      erc1155Balance.save()
    }
  }
}

// global "external" erc1155 TransferBatch event
export function handleTransferBatch(event: TransferBatch): void {
  const from = event.params.from
  const to = event.params.to
  const tokenIds = event.params.ids
  const values = event.params.values

  const erc1155Address = event.address

  if(to.equals(from)){ // ignore if transfer to equals from
    return;
  }

  // check against TO field
  const lootboxTo = LootBox.load(to.toHex())

  if (lootboxTo != null) {
    let erc1155 = loadOrCreateERC1155(erc1155Address)

    for (let i = 0, len = values.length; i < len; i++) {
      // check if ERC1155 entity exists, if null create
      let erc1155Balance = ERC1155Balance.load(
        generateCompositeTokenId(erc1155.id, tokenIds[i], lootboxTo.id)
      )
      if (erc1155Balance == null) {
        erc1155Balance = new ERC1155Balance(
          generateCompositeTokenId(erc1155.id, tokenIds[i], lootboxTo.id)
        )
        erc1155Balance.tokenId = tokenIds[i]
        erc1155Balance.balance = values[i]
        erc1155Balance.erc1155Entity = erc1155Address.toHex()
        erc1155Balance.lootbox = lootboxTo.id
        erc1155Balance.save()
      } else {
        const existingBalance = erc1155Balance.balance
        erc1155Balance.balance = existingBalance.plus(values[i])
        erc1155Balance.save()
      }
    }
  }

  // check against FROM field
  const lootboxFrom = LootBox.load(from.toHex())

  if (lootboxFrom != null) {
    let erc1155 = ERC1155Entity.load(erc1155Address.toHex())
    if (erc1155 == null) {
      erc1155 = new ERC1155Entity(erc1155Address.toHex())
      erc1155.save()
    }
    // reduce the balance of each of these from the array
    for (let i = 0, len = values.length; i < len; i++) {
      let erc1155Balance = ERC1155Balance.load(
        generateCompositeTokenId(erc1155.id, tokenIds[i], lootboxFrom.id)
      )
      const existingBalance = erc1155Balance.balance
      erc1155Balance.balance = existingBalance.minus(values[i])
      if (erc1155Balance.balance.equals(new BigInt(0))) {
        store.remove('ERC1155Balance', erc1155Balance.id)
      } else {
        erc1155Balance.save()
      }
    }
  }
}

// helper functions
function generateCompositeId(ercId: string, lootboxId: string): string {
  return ercId + '-' + lootboxId
}
function generateCompositeTokenId(
  ercId: string,
  tokenId: BigInt,
  lootboxId: string
): string {
  return ercId + '-' + tokenId.toHex() + '-' + lootboxId
}
