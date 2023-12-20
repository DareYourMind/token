import { getProvider } from './providerFactory';

export async function getSigner(addressOrIndex?: string | number): Promise<any> {
  return getProvider().getSigner(addressOrIndex);
}
