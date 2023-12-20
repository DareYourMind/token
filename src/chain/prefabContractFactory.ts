import { ContractKinds } from '../localTypes';
import { getContracts } from '../helpers/contracts-fetcher';
import { Contract, Signer } from 'ethers';
import { getContract } from './contractFactory';

import PingPongABI from '../abi/PingPong.json';

import { ContractsWithArguments } from '../scripts/deployers/deploy';

type AbiAndAddress = {
  abi: Array<string>;
  address: string;
};

export async function loadContract(kind: ContractKinds, signer: Signer): Promise<Contract> {
  const chainId = await signer.getChainId();
  const chainName = getChainName(chainId);

  const contracts = getContracts(chainName);

  const { abi, address } = getAbiAndAddress(kind, contracts);

  if (!address || !abi) {
    throw new Error('Unable to load contract');
  }
  return getContract(address, abi, signer);
}

export async function loadContractWithAddress(
  kind: ContractKinds,
  address: string,
  signer: Signer,
): Promise<Contract> {
  const abi = getAbi(kind);

  if (!address || !abi) {
    throw new Error('Unable to load contract');
  }
  return getContract(address, abi, signer);
}

function getChainName(chainId: number) {
  switch (chainId) {
    case 80001:
      return 'testnet';
    case 56:
      return 'mainnet';
    default:
      return 'localhost';
  }
}

function getAbi(kind: ContractKinds): Array<string> {
  switch (kind) {
    case ContractKinds.PingPong:
      return PingPongABI;
    default:
      throw new Error('Unable to load contract');
  }
}

function getAbiAndAddress(kind: ContractKinds, contracts: ContractsWithArguments): AbiAndAddress {
  switch (kind) {
    case ContractKinds.PingPong: {
      return {
        abi: PingPongABI,
        address: contracts.deployed.contracts.PingPong,
      };
    }
    default:
      throw new Error('Unable to load contract');
  }
}
