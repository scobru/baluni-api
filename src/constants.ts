import {
  InfraConfig,
  GeneralCOnfig,
  TokenConfig,
  NetworkConfig,
  OracleConfig,
} from "./types/constants";

export const BASEURL = "https://baluni-api.scobrudot.dev";

export const INFRA: InfraConfig = {
  "137": {
    ROUTER: "0xbce92137174e4c093591ea1029e224f97e17344b",
  },
};

export const PROTOCOLS: GeneralCOnfig = {
  "137": {
    "uni-v3": {
      ROUTER: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
      QUOTER: "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6",
      FACTORY: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    },
  },
};

export const ORACLE: OracleConfig = {
  "137": {
    "1inch-spot-agg": {
      OFFCHAINORACLE: "0x0AdDd25a91563696D8567Df78D5A01C9a991F9B8",
    },
  },
};

export const NATIVETOKENS: TokenConfig = {
  "137": {
    NATIVE: "0x0000000000000000000000000000000000001010",
    WRAPPED: "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270",
  },
  // Add the rest of yur tokens here
};

export const USDC: NetworkConfig = {
  "137": "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
};

export const NETWORKS: NetworkConfig = {
  "137":
    "https://polygon-mainnet.g.alchemy.com/v2/nPBTC9lNonD1KsZGmuXSRGfVh6O63x2_",
};
