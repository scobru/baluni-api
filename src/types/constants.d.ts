export type InfraConfig = {
  [chainId: string]: {
    ROUTER: string;
  };
};

export type NetworkConfig = {
  [chainId: string]: string;
};

export interface ProtocolConfig {
  ROUTER: string;
  QUOTER: string;
  FACTORY: string;
}

export interface ChainConfig {
  "uni-v3": ProtocolConfig;
}

export interface TokenConfig {
  [chainId: string]: {
    WRAPPED: string;
    NATIVE: string;
  };
}

export interface OracleConfig {
  [chainId: string]: {
    [oracleName: string]: {
      OFFCHAINORACLE: string;
    };
  };
}

export interface GeneralCOnfig {
  [key: string]: ChainConfig;
}
