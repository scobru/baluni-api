import { INFRA, PROTOCOLS, ORACLE, NATIVETOKENS, NETWORKS } from "./constants";
import { swap, batchSwap } from "./uni-v3/swap-tokens";

export function swapUniV3(
  address: string,
  token0: string,
  token1: string,
  reverse: string,
  protocol: string,
  chainId: number,
  amount: number
) {
  return swap(address, token0, token1, reverse, protocol, chainId, amount);
}

export function batchSwapUniV3([...args]: [
  string,
  string,
  string,
  string,
  string,
  number,
  number
][]) {
  const convertedArgs = args.map(
    ([address, token0, token1, reverse, protocol, chainId, amount]) => ({
      address,
      token0,
      token1,
      reverse: reverse === "true",
      protocol,
      chainId,
      amount,
    })
  );

  return batchSwap(convertedArgs);
}

// Example function that uses the INFRA config
export function getInfraAddress(
  chainId: string,
  contractName: string
): string | undefined {
  return INFRA[chainId]?.[contractName];
}

// Example function that uses the PROTOCOLS config
export function getProtocolAddress(
  chainId: string,
  protocolName: string,
  contractName: string
): string | undefined {
  return PROTOCOLS[chainId]?.[protocolName]?.[contractName];
}

// Example function that uses the ORACLE config
export function getOracleAddress(
  chainId: string,
  protocolName: string,
  contractName: string
): string | undefined {
  return ORACLE[chainId]?.[protocolName]?.[contractName];
}

// Example function that uses the NATIVETOKENS config
export function getNativeTokenAddress(
  chainId: string,
  tokenName: string
): string | undefined {
  return NATIVETOKENS[chainId]?.[tokenName];
}

// Example function that uses the NETWORKS config
export function getNetworkRPC(chainId: string): string | undefined {
  return NETWORKS[chainId];
}

export {
  INFRA,
  PROTOCOLS,
  ORACLE,
  NATIVETOKENS,
  NETWORKS,
  BASEURL,
} from "./constants";
