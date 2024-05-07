import { FilecoinClient } from '@blitslabs/filecoin-js-signer';
import {
  CoinType,
  EthAddress,
  bigintToArray,
  delegatedFromEthAddress,
} from '@glif/filecoin-address';
import BigNumber from 'bignumber.js';
import { HttpJsonRpcConnector, LotusClient } from 'filecoin.js';
import { createProposeMessage } from 'filecoin.js/builds/dist/utils/msig';

interface TransactionData {
  to: string;
  data: string;
}

const enum MethodType {
  InvokeEVM = 3844450837,
}

class FVMProposal {
  private chainId!: string;
  private filecoinClient!: FilecoinClient;
  private signer!: string;
  private privateKey!: string;
  private multisigWallet!: string;
  private lotusClient!: LotusClient;
  private transactions: TransactionData[] = [];

  private constructor() {}

  static async create(chainId: string): Promise<FVMProposal> {
    const proposal = new FVMProposal();
    await proposal.init(chainId);

    return proposal;
  }

  private async init(chainId: string) {
    if (!isFVM(chainId)) {
      throw Error('Chain ID is not FVM');
    }
    if (!process.env.FVM_RPC_ENDPOINT) {
      throw Error('FVM_RPC_ENDPOINT is not set');
    }
    if (!process.env.FVM_SIGNER_F1_ADDRESS) {
      throw Error('FVM_SIGNER_F1_ADDRESS is not set');
    }
    if (!process.env.FVM_SIGNER_PRIVATE_KEY) {
      throw Error('FVM_SIGNER_PRIVATE_KEY is not set');
    }
    if (!process.env.FVM_MULTISIG_WALLET_F2_ADDRESS) {
      throw Error('FVM_MULTISIG_WALLET_F2_ADDRESS is not set');
    }

    this.chainId = chainId;
    this.signer = process.env.FVM_SIGNER_F1_ADDRESS;
    this.privateKey = process.env.FVM_SIGNER_PRIVATE_KEY;
    this.multisigWallet = process.env.FVM_MULTISIG_WALLET_F2_ADDRESS;
    this.filecoinClient = new FilecoinClient(process.env.FVM_RPC_ENDPOINT);
    this.lotusClient = new LotusClient(
      new HttpJsonRpcConnector({ url: process.env.FVM_RPC_ENDPOINT }),
    );
  }

  get testnet() {
    return this.chainId.length !== 3;
  }

  async add(to: string, data: string) {
    this.transactions.push({
      to,
      data,
    });
  }

  async submit() {
    if (this.transactions.length === 0) {
      console.warn('Skipped proposal submission due to no update');
      return;
    }

    const addressList: Record<string, string>[] = [];

    for (const transaction of this.transactions) {
      const f410Address = delegatedFromEthAddress(
        transaction.to as EthAddress,
        this.testnet ? CoinType.TEST : CoinType.MAIN,
      );
      const lookupId = await this.lotusClient.state.lookupId(f410Address);

      addressList.push({
        'ETH Address': transaction.to,
        'F410 Address': f410Address,
        'Lookup ID': lookupId,
      });

      const message = await createProposeMessage(
        this.multisigWallet,
        this.signer,
        lookupId,
        '0',
        MethodType.InvokeEVM,
        bigintToArray(transaction.data) as unknown as any[],
      );

      const response = await this.filecoinClient.tx.sendMessage(
        {
          To: message.To,
          From: message.From,
          Value: message.Value ?? new BigNumber(0),
          GasLimit: message.GasLimit ?? 0,
          GasFeeCap: message.GasFeeCap ?? new BigNumber(0),
          GasPremium: message.GasPremium ?? new BigNumber(0),
          Method: message.Method ?? 0,
          Params: message.Params ?? '',
          Version: message.Version ?? 0,
          Nonce: message.Nonce ?? 0,
        },
        this.privateKey,
      );

      console.log(`Submitted proposals at ${response['/']}`);
    }

    console.table(addressList);
  }
}

const isFVM = (chainId: string) => chainId.startsWith('314');

export { FVMProposal, isFVM };
