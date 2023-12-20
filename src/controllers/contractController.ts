import { constants, Contract, ethers, Signer, Wallet } from 'ethers';
import { loadContract, loadContractWithAddress } from '../chain/prefabContractFactory';
import { getContracts } from '../helpers/contracts-fetcher';
import { ContractKinds, ProviderOrSigner } from '../localTypes';
import { ContractsWithArguments } from '../scripts/deployers/deploy';

export class ContractController {
  private _signer: Signer;

  constructor(signerOrProvider: ProviderOrSigner) {
    this._signer = getSigner(signerOrProvider);
  }

  public async getContract<T extends Contract>(kind: ContractKinds): Promise<T> {
    const contract = await loadContract(kind, this._signer);
    return contract as T;
  }

  public async getContractWithAddress<T extends Contract>(kind: ContractKinds, address: string): Promise<T> {
    const contract = await loadContractWithAddress(kind, address, this._signer);
    return contract as T;
  }

  public static contracts(chaindId: 80001 | 137 | 13337): ContractsWithArguments {
    let chainName = 'localhost';
    switch (chaindId) {
      case 80001: {
        chainName = 'testnet';
        break;
      }
      case 137: {
        chainName = 'mainnet';
        break;
      }
    }
    return getContracts(chainName);
  }
}

const getSigner = (signerOrProvider: ProviderOrSigner): Signer => {
  if (signerOrProvider instanceof Signer || signerOrProvider instanceof ethers.providers.JsonRpcSigner)
    return signerOrProvider;
  if (signerOrProvider instanceof Wallet) {
    if (signerOrProvider._isSigner && signerOrProvider.provider) return signerOrProvider;
    else throw new Error('Should send Signer or JsonRpcSigner');
  }
  const account = constants.AddressZero;
  return new ethers.VoidSigner(account, signerOrProvider);
};
