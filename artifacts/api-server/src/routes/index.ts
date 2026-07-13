import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import metricsRouter from "./metrics";
import topicsRouter from "./topics";
import groupsRouter from "./groups";
import mentionsRouter from "./mentions";
import contactsRouter from "./contacts";
import tasksRouter from "./tasks";
import savedRouter from "./saved";
import entitiesRouter from "./entities";
import mediaRouter from "./media";
import evolutionRouter from "./evolution";
import aiRouter from "./ai";
import googleRouter from "./google";
import searchRouter from "./search";
import refreshRouter from "./refresh";
import settingsRouter from "./settings";
import cronRouter from "./cron";
import telegramRouter from "./telegram";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
// Webhooks públicos antes do googleRouter (requireAuth global).
router.use(evolutionRouter);
router.use(cronRouter);
router.use(telegramRouter);
router.use(aiRouter);
router.use(googleRouter);
router.use(metricsRouter);
router.use(topicsRouter);
router.use(groupsRouter);
router.use(mentionsRouter);
router.use(contactsRouter);
router.use(tasksRouter);
router.use(savedRouter);
router.use(entitiesRouter);
router.use(mediaRouter);
router.use(searchRouter);
router.use(refreshRouter);
router.use(settingsRouter);

export default router;
