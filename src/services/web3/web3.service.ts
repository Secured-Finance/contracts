import * as Web3 from 'web3';
import * as RLP from 'rlp';
import { Transaction } from 'ethereumjs-tx';
import { WEB3_CONFIG } from '../../../app.config';

export class Web3Service {
  public web3: any;

  /**
   * Creates an instance of Web3Service and connect to Ethereum network.
   * @memberof Web3Service
   */
  constructor() {
    const web3: any = Web3;
    const provider = WEB3_CONFIG.PROVIDER[WEB3_CONFIG.NETWORK_ID];
    this.web3 = new web3(provider);
  }

  /**
   * Create a contract instance
   *
   * @param {object} contractInterface
   * @param {string} contractAddress
   * @returns {*}
   * @memberof Web3Service
   */
  public getInstance(contractInterface: object, contractAddress: string): any {
    return new this.web3.eth.Contract(contractInterface, contractAddress);
  }

  /**
   * Get a transaction by hash
   *
   * @param {string} txHash
   * @returns {Promise<any>}
   * @memberof Web3Service
   */
  public getTx(txHash: string): Promise<any> {
    return this.web3.eth.getTransaction(txHash);
  }

  /**
   * Get a block info by block number
   *
   * @param {number} blockNumber
   * @returns {Promise<any>}
   * @memberof Web3Service
   */
  public getBlock(blockNumber: number): Promise<any> {
    return this.web3.eth.getBlock(blockNumber);
  }

  /**
   * Convert JSON to Bytes
   *
   * @param {object} json
   * @returns {Array<number>}
   * @memberof Web3Service
   */
  public jsonToBytes(json: object): Array<number> {
    const data = JSON.stringify(json);
    const hex = this.web3.utils.toHex(data);
    return this.web3.utils.hexToBytes(hex);
  }

  /**
   * Convert JSON to Hex
   *
   * @param {object} json
   * @returns {Array<number>}
   * @memberof Web3Service
   */
  public jsonToHex(json: object): Array<number> {
    const data = JSON.stringify(json);
    return this.web3.utils.toHex(data);
  }

  /**
   * Convert Hex to Json or null on error
   *
   * @param {string} hex
   * @returns {*}
   * @memberof Web3Service
   */
  public hexToJson(hex: string): any {
    try {
      const str = this.web3.utils.hexToUtf8(hex);
      return JSON.parse(String(str));
    } catch (e) {
      return; // JSON error to be handled by caller
    }
  }

  /**
   * Method call without consuming gas
   *
   * @param {*} contractInstance
   * @param {string} propertyName
   * @param {object} inputs
   * @returns {Promise<any>}
   * @memberof Web3Service
   */
  public call(
    contractInstance: any,
    propertyName: string,
    inputs: object,
    accountAddress: string,
  ) {
    const property = contractInstance.methods[propertyName];
    const args = Object.values(inputs);
    return property(...args).call({ from: accountAddress });
  }

  /**
   * Send a method calling transaction by consuming gas
   *
   * @param {*} contractInstance
   * @param {string} methodName
   * @param {object} inputs
   * @param {number} pendingTxCount
   * @param {string} [accountAddress=WEB3_CONFIG.SECRET.ACCOUNT]
   * @param {string} [privateKey=WEB3_CONFIG.SECRET.PRIVATE_KEY]
   * @param {number} [value=0]
   * @returns
   * @memberof Web3Service
   */
  public async send(
    contractInstance: any,
    methodName: string,
    inputs: object,
    pendingTxCount: number,
    accountAddress: string,
    privateKey: string,
    value = 0,
    gasLimit?: number,
  ) {
    const method = contractInstance.methods[methodName];
    const args = Object.values(inputs);
    const data = method(...args).encodeABI();
    const to = contractInstance.options.address;
    // const gasLimit = await method(...args).estimateGas({
    //   from: accountAddress,
    //   to,
    //   nonce: pendingTxCount,
    //   data,
    // });
    const rawTx = await this.getRawTx(
      to,
      value,
      data,
      pendingTxCount,
      accountAddress,
      gasLimit,
    );
    return await this.sendSignedTransaction(rawTx, privateKey);
  }

  /**
   * Deploy a contract and return address and txHash immediately
   *
   * @param {object} contractInterface
   * @param {string} contractBytecode
   * @param {object} inputs
   * @param {number} pendingTxCount
   * @param {string} [accountAddress=WEB3_CONFIG.SECRET.ACCOUNT]
   * @param {string} [privateKey=WEB3_CONFIG.SECRET.PRIVATE_KEY]
   * @param {number} [value=0]
   * @returns {Promise<string>}
   * @memberof Web3Service
   */
  public async deploy(
    contractInterface: object,
    contractBytecode: string,
    inputs: object,
    pendingTxCount: number,
    accountAddress: string,
    privateKey: string,
    value = 0,
    gasLimit?: number,
  ): Promise<string> {
    const contractInstance = new this.web3.eth.Contract(contractInterface);
    const args = inputs ? Object.values(inputs) : null;
    const data = contractInstance
      .deploy({ data: contractBytecode, arguments: args })
      .encodeABI();
    const to = null;

    const rawTx = await this.getRawTx(
      to,
      value,
      data,
      pendingTxCount,
      accountAddress,
      gasLimit,
    );

    return await this.sendSignedTransaction(rawTx, privateKey);
  }

  /**
   * Generate Contract Address before sending transactions
   *
   * @param {string} nonce
   * @returns {string}
   * @memberof Web3Service
   */
  public genContractAddress(nonce: number, accountAddress: string): string {
    return (
      '0x' +
      this.web3.utils
        .sha3(RLP.encode([accountAddress, nonce]))
        .slice(12)
        .substring(14)
    );
  }

  /**
   *
   *
   * @returns {number}
   * @memberof Web3Service
   */
  async getPendingTxCount(accountAddress: string): Promise<number> {
    return await this.web3.eth.getTransactionCount(accountAddress, 'pending');
  }

  /**
   *
   *
   * @private
   * @param {*} rawTx
   * @param {string} privateKey
   * @returns {Promise<string>}
   * @memberof Web3Service
   */
  private async sendSignedTransaction(
    rawTx: any,
    privateKey: string,
  ): Promise<string> {
    const tx = new Transaction(rawTx, {
      chain: WEB3_CONFIG.CHAIN[WEB3_CONFIG.NETWORK_ID],
    });
    const key = Buffer.from(privateKey, 'hex');
    tx.sign(key);
    const signedTx = '0x' + tx.serialize().toString('hex');
    return new Promise<string>((resolve, reject) => {
      this.web3.eth
        .sendSignedTransaction(signedTx)
        .once('transactionHash', (res: string) => resolve(res))
        // .on('receipt', receipt => {
        //   resolve(receipt.transactionHash);
        // })
        .on('error', (err: any) => {
          reject(err);
        });
    });
  }

  /**
   * Helper to generate raw transaction data
   *
   * @private
   * @param {string} to
   * @param {number} value
   * @param {string} data
   * @param {number} pendingTxCount
   * @param {string} from
   * @param {number} [gasLimit]
   * @returns {Promise<any>}
   * @memberof Web3Service
   */
  private async getRawTx(
    to: string,
    value: number,
    data: string,
    pendingTxCount: number,
    from: string,
    gasLimit?: number,
  ): Promise<any> {
    const toHex = this.web3.utils.toHex;
    const gasPrice = await this.web3.eth.getGasPrice();

    // adjust gas limit
    const latestLimit = (await this.web3.eth.getBlock('latest')).gasLimit;
    const adjLimit = Math.round(latestLimit * 0.95); // buffer to avoid drop

    return {
      to,
      from,
      value: toHex(value),
      data, // bytecode
      gasPrice: toHex(gasPrice * 2),
      gasLimit: toHex(gasLimit || adjLimit),
      nonce: toHex(pendingTxCount),
    };
  }

  /**
   * Helper to get events from contract abi and address
   *
   * @private
   * @param {object} abi
   * @param {string} addr
   * @param {string} eventName
   * @param {number} fromBlock
   * @param {*} [filter={}]
   * @returns {objcet[]}
   * @memberof ContractEventFetchingService
   */
  public async getRawEvents(
    abi: object,
    addr: string,
    eventName: string,
    fromBlock: number,
    filter = {},
  ) {
    const contract = this.getInstance(abi, addr);
    const events = await contract.getPastEvents(eventName, {
      filter,
      fromBlock,
      toBlock: 'latest', // default
    });
    return events;
  }
}
