require('dotenv/config');
const { hexFILString } = require('../test-utils').strings;
const { fromWeiToEther } = require('../test-utils').numbers;

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const addressResolver = await deployments.get('AddressResolver');
  const settlementEngine = await deployments.get('SettlementEngine');
  const oracle = await deployments.get('Operator');

  const oracleContract = await ethers.getContractAt('Operator', oracle.address);
  const settlementEngineContract = await ethers.getContractAt(
    'SettlementEngine',
    settlementEngine.address,
  );

  const linkTokenAddress = await oracleContract.getChainlinkToken();

  const settlementAdapter = await deploy('ChainlinkSettlementAdapter', {
    from: deployer,
    args: [
      addressResolver.address,
      oracle.address,
      process.env.CHAINLINK_JOB_ID,
      process.env.CHAINLINK_REQUEST_FEE,
      linkTokenAddress,
      hexFILString,
    ],
  });
  console.log(
    'Deployed ChainlinkSettlementAdapter at ' + settlementAdapter.address,
  );

  const linkContract = await ethers.getContractAt(
    'LinkToken',
    linkTokenAddress,
  );
  const depositAmount = process.env.CHAINLINK_LINK_DEPOSIT || 0;
  if (depositAmount > 0) {
    const tx = await linkContract.transfer(
      settlementAdapter.address,
      depositAmount,
    );
    await tx.wait();
  }
  console.log(
    `Sent ${fromWeiToEther(depositAmount)} LINK to ` +
      settlementAdapter.address,
  );

  await (
    await settlementEngineContract.addExternalAdapter(
      settlementAdapter.address,
      hexFILString,
    )
  ).wait();
};

module.exports.tags = ['ChainlinkSettlementAdapter'];
module.exports.dependencies = [
  'AddressResolver',
  'ChainlinkOracle',
  'Migration',
];
