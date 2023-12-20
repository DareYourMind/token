import { ContractsWithArguments } from '../scripts/deployers/deploy';
import localhost from "../scripts/deployment/localhost/deployed.json";
import testnet from "../scripts/deployment/testnet/deployed.json";
import mainnet from "../scripts/deployment/mainnet/deployed.json";

const map = new Map();

map.set('localhost', localhost);
map.set('testnet', testnet);
map.set('mainnet', mainnet);

map.set(1337, localhost);
map.set(80001, testnet);
map.set(56, mainnet);

export const getContracts = (network: string | number ): ContractsWithArguments => map.get(network);
