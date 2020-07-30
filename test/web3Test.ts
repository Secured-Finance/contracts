import { Web3Service } from '../src/services/web3/web3.service';

const accountAddr = process.env.ACCOUNT_ADDR;
const accountPriv = process.env.PRIVATE_KEY;

// contracts
import * as CompiledToken from '../contracts/MoneyMarket.json';
const ABI = CompiledToken.abi;
const BYTECODE = CompiledToken.bytecode;
const CONTRACT_ADDR = '0x69A010d8ffB7faA0cf8B94C6022420EDe8274811';

const web3Service = new Web3Service();

async function deploy_test() {
  const nonce = await web3Service.getPendingTxCount(accountAddr);
  console.log('pending txCount is', nonce);
  const contractAddr = await web3Service.genContractAddress(nonce, accountAddr);
  console.log('contract addr is', contractAddr);
  const txHash = await web3Service.deploy(
    ABI,
    BYTECODE,
    null,
    nonce,
    accountAddr,
    accountPriv,
  );
  console.log('txHash is', txHash);
}
// deploy_test();

async function send_test() {
  const instance = web3Service.getInstance(ABI, CONTRACT_ADDR);
  const nonce = await web3Service.getPendingTxCount(accountAddr);
  console.log('pending txCount is', nonce);

  const methodName = 'setLoans';
  const inputs = sample.MoneyMarket;
  const txHash = await web3Service.send(
    instance,
    methodName,
    inputs,
    nonce,
    accountAddr,
    accountPriv,
  );
  console.log('txHash is', txHash);
}
// send_test();

async function call_test() {
  const instance = web3Service.getInstance(ABI, CONTRACT_ADDR);
  const rates = await web3Service.call(instance, 'getMidRates', {}, accountAddr);
  console.log('mid rates', rates);
}
call_test();

const sample = {
  MoneyMarket: {
    ccy: 1,
    lenders: [
      [0, 100, 7],
      [1, 111, 11],
      [2, 222, 22],
      [3, 333, 33],
      [4, 444, 44],
      [5, 555, 55],
    ],
    borrowers: [
      [0, 100, 5],
      [1, 111, 6],
      [2, 222, 20],
      [3, 333, 30],
      [4, 444, 40],
      [5, 555, 50],
    ],
    effectiveSec: 36000,
  },
  FXMarket: {
    pair: 0,
    offerInput: [1, 0, 100000, 8500],
    bidInput: [1, 0, 100000, 8000],
    effectiveSec: 3600,
  },
};
