import {
  CoreFallThrough,
  IDelegateCallProxyManager,
  IERC20,
  IIndexPool,
  IProxyManagerAccessControl,
  Redistributor,
  RestrictedIndexPool,
  SigmaFallThrough,
  UniBurn,
} from "../../typechain";
import { getPoolData } from "../data";
import { getAllPairData } from "../data/pair-data";
import { getContract, deployContract, withSignerAndGasMoney } from "./chain";
import {
  CC10,
  DEFI5,
  DEGEN,
  DRAIN_BLOCK,
  FFF,
  ORCL5,
  ProxyManager,
  ProxyManagerAccessControl,
  treasury,
  UNISWAP_PAIRS,
  WETH,
} from "./constants";
import {
  corePoolImplementationID,
  sigmaPoolImplementationID,
} from "./implementationIDs";

export const testFixtures = async (
  updateImplementations = false,
  sendLpEth = false
) => {
  const orcl5: IIndexPool = await getContract(ORCL5, "IIndexPool");
  const degen: IIndexPool = await getContract(DEGEN, "IIndexPool");
  const defi5: RestrictedIndexPool = await getContract(
    DEFI5,
    "RestrictedIndexPool"
  );
  const cc10: RestrictedIndexPool = await getContract(
    CC10,
    "RestrictedIndexPool"
  );
  const fff: RestrictedIndexPool = await getContract(
    FFF,
    "RestrictedIndexPool"
  );
  const defi5LP: IERC20 = (await getContract(
    UNISWAP_PAIRS.defi5,
    "IERC20"
  )) as IERC20;
  const cc10LP: IERC20 = (await getContract(
    UNISWAP_PAIRS.cc10,
    "IERC20"
  )) as IERC20;
  const fffLP: IERC20 = (await getContract(
    UNISWAP_PAIRS.fff,
    "IERC20"
  )) as IERC20;
  const OLD_DEFI5_DATA = await getPoolData(defi5, DRAIN_BLOCK);
  const OLD_CC10_DATA = await getPoolData(cc10, DRAIN_BLOCK);
  const OLD_FFF_DATA = await getPoolData(fff, DRAIN_BLOCK);
  const implementation: RestrictedIndexPool = await deployContract(
    "RestrictedIndexPool"
  );
  const sigmaFallthrough: SigmaFallThrough = await deployContract(
    "SigmaFallThrough",
    implementation.address
  );
  const coreFallthrough: CoreFallThrough = await deployContract(
    "CoreFallThrough",
    implementation.address
  );
  const weth: IERC20 = await getContract(WETH, "IERC20");
  const uniBurn: UniBurn = await deployContract("UniBurn");

  const { lpStates, pairDatas, totalETH } = await getAllPairData(
    defi5,
    cc10,
    fff
  );

  if (updateImplementations) {
    await withSignerAndGasMoney(treasury, async (treasurySigner) => {
      const proxyManager: IDelegateCallProxyManager = await getContract(
        ProxyManager,
        "IDelegateCallProxyManager",
        treasurySigner
      );
      const proxyManagerAccessControl: IProxyManagerAccessControl = await getContract(
        ProxyManagerAccessControl,
        "IProxyManagerAccessControl",
        treasurySigner
      );
      await proxyManagerAccessControl.setImplementationAddressManyToOne(
        sigmaPoolImplementationID,
        sigmaFallthrough.address
      );
      await proxyManagerAccessControl.setImplementationAddressManyToOne(
        corePoolImplementationID,
        coreFallthrough.address
      );
    });
  }

  if (sendLpEth) {
    await withSignerAndGasMoney(treasury, async (treasurySigner) => {
      await weth.connect(treasurySigner).transfer(uniBurn.address, totalETH);
    });
  }

  const redistributor: Redistributor = await deployContract("Redistributor", uniBurn.address);

  return {
    orcl5,
    degen,
    defi5,
    cc10,
    fff,
    defi5LP,
    cc10LP,
    fffLP,
    OLD_DEFI5_DATA,
    OLD_CC10_DATA,
    OLD_FFF_DATA,
    implementation,
    sigmaFallthrough,
    coreFallthrough,
    weth,
    uniBurn,
    lpStates,
    pairDatas,
    totalETH,
    redistributor,
  };
};
