require('dotenv/config');
const { hexFILString } = require('../test-utils/').strings;
const { fromWeiToEther } = require('../test-utils/').numbers;

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy, getNetworkName } = deployments;
  const { deployer } = await getNamedAccounts();
  const network = getNetworkName();

  let linkTokenAddress;
  switch (network) {
    case 'hardhat': {
      const linkToken = await deploy('LinkToken', { from: deployer });
      linkTokenAddress = linkToken.address;
      console.log('Deployed LinkToken at ' + linkToken.address);
      break;
    }
    case 'rinkeby': {
      linkTokenAddress = '0x01BE23585060835E02B77ef475b0Cc51aA1e0709';
      break;
    }
    case 'mainnet': {
      linkTokenAddress = '0x0000000000000000000000000000000000000000';
      break;
    }
    default: {
      linkTokenAddress = process.env.LINK_CONTRACT_ADDRESS;
      break;
    }
  }

  console.log('LinkToken Address is ' + linkTokenAddress);

  const oracle = await deploy('Operator', {
    from: deployer,
    args: [linkTokenAddress, deployer],
  });

  console.log('Deployed Oracle at ' + oracle.address);

  const oracleContract = await ethers.getContractAt('Operator', oracle.address);
  const tx1 = await oracleContract.setAuthorizedSenders([
    process.env.CHAINLINK_NODE_ACCOUNT,
  ]);
  await tx1.wait();

  const settlementEngine = await deployments.get('SettlementEngine');
  const settlementEngineContract = await ethers.getContractAt(
    'SettlementEngine',
    settlementEngine.address,
  );

  const settlementAdapter = await deploy('ChainlinkSettlementAdapter', {
    from: deployer,
    args: [
      oracle.address,
      process.env.CHAINLINK_JOB_ID,
      process.env.CHAINLINK_REQUEST_FEE,
      linkTokenAddress,
      hexFILString,
      settlementEngine.address,
    ],
  });
  console.log(
    'Deployed ChainlinkSettlementAdapter at ' + settlementAdapter.address,
  );

  await (
    await settlementEngineContract.addExternalAdapter(
      settlementAdapter.address,
      hexFILString,
    )
  ).wait();

  const linkContract = await ethers.getContractAt(
    'LinkToken',
    linkTokenAddress,
  );
  const tx2 = await linkContract.transfer(
    settlementAdapter.address,
    process.env.CHAINLINK_LINK_DEPOSIT,
  );
  await tx2.wait();
  console.log(
    `Sent ${fromWeiToEther(process.env.CHAINLINK_LINK_DEPOSIT)} LINK to ` +
      settlementAdapter.address,
  );
};

module.exports.tags = ['ChainlinkSettlementAdaptor'];
module.exports.dependencies = ['SettlementEngine'];
