import { ethers, Signer } from 'ethers';

export type ProviderOrSigner = Signer | ethers.providers.JsonRpcSigner | ethers.providers.Provider;

export enum ContractKinds {
  PingPong = 'PingPong'
}


export type Contracts = {
  PingPong: string;
};

