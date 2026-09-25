import { UserManagement as UserManagementClient } from "@zcatalyst/auth";
import type { NewUser, RegisteredUser } from "@repo/types/user";
import { CatalystError } from "@/errors/catalyst_error";
import { currentContext } from "@/framework/async_context";
import { env } from "@/utils/env";

type RegisteredUserDetails = Awaited<
  ReturnType<UserManagementClient["registerUser"]>
>["user_details"];

/** Fresh per call. The app is per-request and carries the caller's credentials,
 *  so a service must never be hoisted to module scope. */
function userManagement(): UserManagementClient {
  return new UserManagementClient(currentContext().manager.catalyst);
}

function toRegisteredUser(details: RegisteredUserDetails): RegisteredUser {
  return {
    userId: details.user_id,
    emailId: details.email_id,
    firstName: details.first_name,
    lastName: details.last_name,
    isConfirmed: details.is_confirmed,
  };
}

/** Catalyst app users. Like `Zcql`, this names no resource, so it has no handle. */
export class UserManagement {
  /** Registers an app user. Catalyst emails them a link to confirm and set a password. */
  static async register(user: NewUser): Promise<RegisteredUser> {
    try {
      const registered = await userManagement().registerUser(
        {
          platform_type: "web",
          redirect_url: env.get("AUTH_REDIRECT_URL"),
        },
        {
          first_name: user.firstName,
          last_name: user.lastName,
          email_id: user.emailId,
        },
      );
      return toRegisteredUser(registered.user_details);
    } catch (cause) {
      throw CatalystError.InvalidResource(
        `Failed to register ${user.emailId}`,
        cause,
      );
    }
  }
}
