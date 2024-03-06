export type TokenConfig = {
  [chainId: string]: {
    [tokenName: string]: string;
  };
};

export type InfraConfig = {
  [chainId: string]: {
    [contractName: string]: string;
  };
};

export type NetworkConfig = {
  [chainId: string]: string;
};

export type GeneralCOnfig = {
  [chainId: string]: {
    [protocolName: string]: {
      [contractName: string]: string;
    };
  };
};
