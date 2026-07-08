import { Router, type IRouter } from "express";
import healthRouter from "./health";
import leaderboardRouter from "./leaderboard";
import referralTrackRouter from "./referral-track";
import referralStatsRouter from "./referral-stats";
import resolveUsersRouter from "./resolve-users";
import webhookRouter from "./webhook";
import fidWalletRouter from "./fid-wallet";

const router: IRouter = Router();

router.use(healthRouter);
router.use(leaderboardRouter);
router.use(referralTrackRouter);
router.use(referralStatsRouter);
router.use(resolveUsersRouter);
router.use(webhookRouter);
router.use(fidWalletRouter);

export default router;
