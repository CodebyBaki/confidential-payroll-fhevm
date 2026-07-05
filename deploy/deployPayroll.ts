import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedPayroll = await deploy("ConfidentialPayroll", {
    from: deployer,
    log: true,
  });

  console.log(`ConfidentialPayroll contract: `, deployedPayroll.address);
};
export default func;
func.id = "deploy_confidentialPayroll"; // id required to prevent reexecution
func.tags = ["ConfidentialPayroll"];
