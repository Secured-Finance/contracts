const { loanPrefix } = require('../test-utils').strings;

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  const dealIdLibrary = await deployments.get('DealId');
  const loan = await deployments.get('LoanV2');
  const lendingControllerContract = await deployments.get(
    'LendingMarketController',
  );

  const productResolver = await deploy('ProductAddressResolver', {
    from: deployer,
    libraries: {
      DealId: dealIdLibrary.address,
    },
  });
  console.log('Deployed ProductAddressResolver at ' + productResolver.address);

  const productResolverContract = await ethers.getContractAt(
    'ProductAddressResolver',
    productResolver.address,
  );

  await (
    await productResolverContract.registerProduct(
      loanPrefix,
      loan.address,
      lendingControllerContract.address,
      { from: deployer },
    )
  ).wait();
};

module.exports.tags = ['ProductAddressResolver'];
module.exports.dependencies = ['Libraries', 'Loan', 'LendingMarketController'];
