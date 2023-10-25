import SafeApiKit from '@safe-global/api-kit';
import Safe from '@safe-global/protocol-kit';
import {
  EthAdapter,
  MetaTransactionData,
} from '@safe-global/safe-core-sdk-types';
import { DeployResult } from 'hardhat-deploy/types';

const executeIfNewlyDeployment = async (
  name: string,
  deployResult: DeployResult,
  callback?: () => Promise<void>,
) => {
  if (deployResult.newlyDeployed) {
    console.log(`Deployed ${name} at ${deployResult.address}`);
    callback && (await callback());
  } else {
    console.warn(`Skipped deploying ${name}`);
  }
};

interface DeploymentFunction {
  name: string;
  args: any[];
}
interface Deployment {
  contractName: string;
  functions: DeploymentFunction[];
}
class DeploymentStorage {
  private static _instance: DeploymentStorage;
  private _deployments: Record<string, Deployment> = {};

  private constructor() {}

  static get instance() {
    if (this._instance) return this._instance;
    this._instance = new DeploymentStorage();
    return this._instance;
  }

  add(
    contractAddress: string,
    contractName: string,
    functionName: string,
    args: any[],
  ) {
    if (
      this._deployments[contractAddress]?.functions?.some(
        (deployment) => deployment.name === functionName,
      )
    ) {
      throw new Error(`Deployment for ${functionName} already exists`);
    }

    if (!this._deployments[contractAddress]) {
      this._deployments[contractAddress] = {
        contractName,
        functions: [],
      };
    }

    this._deployments[contractAddress].functions.push({
      name: functionName,
      args,
    });
  }

  get deployments(): Record<string, Deployment> {
    return this._deployments;
  }
}

class Proposal {
  private safeAddress: string;
  private txServiceUrl: string;
  private safeService!: SafeApiKit;
  private safeSdk!: Safe;
  private safeTransactionData: MetaTransactionData[] = [];

  constructor() {
    if (!process.env.SAFE_WALLET_ADDRESS) {
      throw Error('SAFE_WALLET_ADDRESS is not set');
    }
    if (!process.env.SAFE_API_URL) {
      throw Error('SAFE_API_URL is not set');
    }

    this.safeAddress = process.env.SAFE_WALLET_ADDRESS;
    this.txServiceUrl = process.env.SAFE_API_URL;
  }

  async initSdk(ethAdapter: EthAdapter) {
    this.safeService = new SafeApiKit({
      ethAdapter,
      txServiceUrl: this.txServiceUrl,
    });
    this.safeSdk = await Safe.create({
      ethAdapter,
      safeAddress: this.safeAddress,
    });
  }

  async add(to: string, data: string) {
    this.safeTransactionData.push({
      to,
      data,
      value: '0',
    });
  }

  async submit(sender: string, origin: string) {
    if (this.safeTransactionData.length === 0) {
      console.warn('Skipped proposal submission due to no update');
      return;
    }

    const safeTransaction = await this.safeSdk.createTransaction({
      safeTransactionData: this.safeTransactionData,
    });

    const safeTxHash = await this.safeSdk.getTransactionHash(safeTransaction);
    const senderSignature = await this.safeSdk.signTransactionHash(safeTxHash);

    await this.safeService.proposeTransaction({
      safeAddress: this.safeAddress,
      safeTransactionData: safeTransaction.data,
      safeTxHash,
      senderAddress: sender,
      senderSignature: senderSignature.data,
      origin,
    });

    const tx = await this.safeService.getTransaction(safeTxHash);

    console.log(`Submitted proposals at ${tx.safeTxHash}`);
  }
}

export { DeploymentStorage, Proposal, executeIfNewlyDeployment };
