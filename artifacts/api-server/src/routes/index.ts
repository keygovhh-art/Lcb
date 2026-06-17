import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import discussionsRouter from "./discussions";
import newsRouter from "./news";
import groupsRouter from "./groups";
import minyansRouter from "./minyans";
import volunteersRouter from "./volunteers";
import charityRouter from "./charity";
import statsRouter from "./stats";
import platformRouter from "./platform";
import causeSupportersRouter from "./cause-supporters";

const router: IRouter = Router();

router.use(healthRouter);
router.use(usersRouter);
router.use(discussionsRouter);
router.use(newsRouter);
router.use(groupsRouter);
router.use(minyansRouter);
router.use(volunteersRouter);
router.use(charityRouter);
router.use(statsRouter);
router.use(platformRouter);
router.use(causeSupportersRouter);

export default router;
