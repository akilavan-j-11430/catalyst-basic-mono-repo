import { Router } from "express";
import { z } from "zod";
import { ApiPath } from "@repo/routing/api-path";
import { InputValidation } from "@repo/input-validation/input-validation";
import { CatalystScope } from "@repo/catalyst-node/catalyst-scope";
import { UserManagement } from "@repo/catalyst-node/user-management";
import type { NewUser } from "@repo/types/user";
import { catalystSessionOf, initCatalystScopes } from "@repo/http-server/middleware";
import { toRecordResponse } from "@repo/http-server/response";
import { env } from "@/env";

/** What a registration must send. Each message says what is wrong with its field. */
const newUserSchema = z.object(
  {
    firstName: z.string({ error: "is required." }).trim().min(1, "is required."),
    lastName: z.string({ error: "is required." }).trim().min(1, "is required."),
    emailId: z
      .string({ error: "is required." })
      .trim()
      .pipe(z.email("is not a valid email address.")),
  },
  { error: "Expected a JSON object." },
);

export const authRouter: Router = Router();

authRouter.post(
  ApiPath.Register,
  initCatalystScopes([CatalystScope.Admin]),
  async (req, res) => {
    const user: NewUser = InputValidation.parse(newUserSchema, req.body);
    const registered = await UserManagement.register(catalystSessionOf(res), {
      user,
      redirectUrl: env.get("AUTH_REDIRECT_URL"),
    });
    res.status(201).json(toRecordResponse(registered));
  },
);
