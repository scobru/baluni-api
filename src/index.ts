import { INFRA, PROTOCOLS, ORACLE, NATIVETOKENS, NETWORKS } from "./constants"; // Assuming your config is in a file named config.ts in the same directory
import { swap, batchSwap } from "./uni-v3/swap-tokens"; // Adjust the import path based on your file structure

function swapUniV3(
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

function batchSwapUniV3([...args]: [
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
function getInfraAddress(
  chainId: string,
  contractName: string
): string | undefined {
  return INFRA[chainId]?.[contractName];
}

// Example function that uses the PROTOCOLS config
function getProtocolAddress(
  chainId: string,
  protocolName: string,
  contractName: string
): string | undefined {
  return PROTOCOLS[chainId]?.[protocolName]?.[contractName];
}

// Example function that uses the ORACLE config
function getOracleAddress(
  chainId: string,
  protocolName: string,
  contractName: string
): string | undefined {
  return ORACLE[chainId]?.[protocolName]?.[contractName];
}

// Example function that uses the NATIVETOKENS config
function getNativeTokenAddress(
  chainId: string,
  tokenName: string
): string | undefined {
  return NATIVETOKENS[chainId]?.[tokenName];
}

// Example function that uses the NETWORKS config
function getNetworkRPC(chainId: string): string | undefined {
  return NETWORKS[chainId];
}
