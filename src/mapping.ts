import { BigInt, ethereum } from "@graphprotocol/graph-ts"
import {
  Transfer
} from "../generated/"
import { TransferEntity } from "../generated/schema"

export function handleTransfer(event: Transfer): void {
  // Entities can be loaded from the store using a string ID; this ID
  // needs to be unique across all entities of the same type
  let entity = TransferEntity.load(event.transaction.from.toHex())

  // Entities only exist after they have been saved to the store;
  // `null` checks allow to create entities on demand
  if (entity == null) {
    entity = new TransferEntity(event.transaction.from.toHex())

    // Entity fields can be set using simple assignments
    //entity.count = BigInt.fromI32(0)
  }

  // BigInt and BigDecimal math are supported
  //entity.count = entity.count + BigInt.fromI32(1)

  // Entity fields can be set based on event parameters
  entity.owner = event.params.owner
  entity.spender = event.params.spender
  entity.amount = (event.params.value).toString()

  // Entities can be written to the store with `.save()`
  entity.save()

  // Note: If a handler doesn't require existing field values, it is faster
  // _not_ to load the entity from the store. Instead, create it fresh with
  // `new Entity(...)`, set the fields that should be updated and save the
  // entity back to the store. Fields that were not set or unset remain
  // unchanged, allowing for partial updates to be applied.

  // It is also possible to access smart contracts from mappings. For
  // example, the contract that has emitted the event can be connected to
  // with:
  //
  // let contract = Contract.bind(event.address)
  //
  // The following functions can then be called on this contract to access
  // state variables and other data:

}

export function handleCreateERC721Controlled(call: ethereum.Call): void {

  /*

  function createERC721Controlled(
    string memory name,
    string memory symbol,
    string memory baseURI
  ) returns ERC721Controlled
  */

  // the returned address is the Lootbox address
  // we need to check ALL ERC20, 721 and 1155 to/from fields against this address

  // create new LootBoxEntity here? assign ID = address?

}


//# write 5 mappings