import { ErrorCode } from "@/enums/error-codes";
import { CatalystError } from "@/errors/catalyst-error";
import { Mail as CatalystMail } from "@zcatalyst/mail";
import type { CatalystScope } from "@/enums/catalyst-scope";
import { currentContext } from "@/framework/async-context";

/** Fresh per call. The app is per-request and carries the caller's credentials,
 *  so a service must never be hoisted to module scope. */
function mailClient(scope: CatalystScope): CatalystMail {
  return new CatalystMail(currentContext().manager.catalyst.getApp(scope));
}

/** One plain-text email. `from` must be a sender verified in the project's Mail settings. */
export interface MailMessage {
  from: string;
  /** Shown as the sender's name in the recipient's inbox. */
  fromName: string;
  to: string;
  subject: string;
  text: string;
}

/** Catalyst Mail bound to a scope. Reached only through `Mail.runIn`. */
class ScopedMail {
  constructor(private readonly scope: CatalystScope) {}

  async send(message: MailMessage): Promise<void> {
    try {
      await mailClient(this.scope).sendMail({
        from_email: message.from,
        display_name: message.fromName,
        to_email: message.to,
        subject: message.subject,
        content: message.text,
        html_mode: false,
      });
    } catch (cause) {
      throw new CatalystError(ErrorCode.INVALID_RESOURCE, `Mail to ${message.to} failed`, cause);
    }
  }
}

export type { ScopedMail };

/** Catalyst Mail. A message belongs to no resource, so this names none and has no handle
 *  in `resources.ts`. */
export class Mail {
  /** The Mail operations, acting with the scope's credentials. */
  static runIn(scope: CatalystScope): ScopedMail {
    return new ScopedMail(scope);
  }
}
