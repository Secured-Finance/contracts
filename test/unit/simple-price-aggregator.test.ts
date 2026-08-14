import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { Contract } from 'ethers';
import { artifacts, ethers, waffle } from 'hardhat';

const SimplePriceAggregator = artifacts.require('SimplePriceAggregator');
const { deployContract } = waffle;

describe('SimplePriceAggregator', () => {
  const initialAnswer = 100_000_000;
  const description = 'TEST / USD';

  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let aggregator: Contract;

  before(async () => {
    [owner, alice] = await ethers.getSigners();
  });

  beforeEach(async () => {
    aggregator = await deployContract(owner, SimplePriceAggregator, [
      initialAnswer,
      description,
    ]);
  });

  it('initializes the owner, metadata, and first round', async () => {
    const deploymentBlock = await ethers.provider.getBlock(
      aggregator.deployTransaction.blockNumber!,
    );

    expect(await aggregator.owner()).to.equal(owner.address);
    expect(await aggregator.decimals()).to.equal(8);
    expect(await aggregator.description()).to.equal(description);
    expect(await aggregator.version()).to.equal(1);
    expect(await aggregator.latestRound()).to.equal(1);
    expect(await aggregator.latestAnswer()).to.equal(initialAnswer);
    expect(await aggregator.latestTimestamp()).to.equal(
      deploymentBlock.timestamp,
    );
    expect(await aggregator.getAnswer(1)).to.equal(initialAnswer);
    expect(await aggregator.getTimestamp(1)).to.equal(
      deploymentBlock.timestamp,
    );
  });

  it('allows only the owner to update the answer', async () => {
    await expect(
      aggregator.connect(alice).updateAnswer(200_000_000),
    ).to.be.revertedWith('Ownable: caller is not the owner');

    expect(await aggregator.latestRound()).to.equal(1);
    expect(await aggregator.latestAnswer()).to.equal(initialAnswer);
  });

  it('increments the round and retains historical data', async () => {
    const initialTimestamp = await aggregator.latestTimestamp();
    const answer = 200_000_000;
    const transaction = await aggregator.updateAnswer(answer);
    const receipt = await transaction.wait();
    const updateBlock = await ethers.provider.getBlock(receipt.blockNumber);

    expect(await aggregator.latestRound()).to.equal(2);
    expect(await aggregator.latestAnswer()).to.equal(answer);
    expect(await aggregator.latestTimestamp()).to.equal(updateBlock.timestamp);
    expect(await aggregator.getAnswer(1)).to.equal(initialAnswer);
    expect(await aggregator.getTimestamp(1)).to.equal(initialTimestamp);
    expect(await aggregator.getAnswer(2)).to.equal(answer);
    expect(await aggregator.getTimestamp(2)).to.equal(updateBlock.timestamp);
  });

  it('returns Chainlink-compatible round data', async () => {
    const firstTimestamp = await aggregator.latestTimestamp();
    const answer = 200_000_000;
    const transaction = await aggregator.updateAnswer(answer);
    const receipt = await transaction.wait();
    const updateBlock = await ethers.provider.getBlock(receipt.blockNumber);

    const firstRound = await aggregator.getRoundData(1);
    expect(firstRound.roundId).to.equal(1);
    expect(firstRound.answer).to.equal(initialAnswer);
    expect(firstRound.startedAt).to.equal(firstTimestamp);
    expect(firstRound.updatedAt).to.equal(firstTimestamp);
    expect(firstRound.answeredInRound).to.equal(1);

    const latestRound = await aggregator.latestRoundData();
    expect(latestRound.roundId).to.equal(2);
    expect(latestRound.answer).to.equal(answer);
    expect(latestRound.startedAt).to.equal(updateBlock.timestamp);
    expect(latestRound.updatedAt).to.equal(updateBlock.timestamp);
    expect(latestRound.answeredInRound).to.equal(2);
  });

  it('emits Chainlink-compatible events when updating', async () => {
    const answer = 200_000_000;
    const transaction = aggregator.updateAnswer(answer);

    await expect(transaction)
      .to.emit(aggregator, 'NewRound')
      .withArgs(2, owner.address, await getTransactionTimestamp(transaction));
    await expect(transaction)
      .to.emit(aggregator, 'AnswerUpdated')
      .withArgs(answer, 2, await getTransactionTimestamp(transaction));
  });

  it('reverts when round data does not exist', async () => {
    await expect(aggregator.getRoundData(0)).to.be.revertedWith(
      'No data present',
    );
    await expect(aggregator.getRoundData(2)).to.be.revertedWith(
      'No data present',
    );
  });
});

async function getTransactionTimestamp(
  transactionPromise: Promise<any>,
): Promise<number> {
  const transaction = await transactionPromise;
  const receipt = await transaction.wait();
  const block = await ethers.provider.getBlock(receipt.blockNumber);
  return block.timestamp;
}
