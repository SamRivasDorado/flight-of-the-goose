# Goose sign-in emails

Branded versions of the emails Supabase sends. Paste each file into Supabase:
**Authentication, Emails, Templates**, choose the template, put the subject in **Subject**, paste the file into **Message body**, and click **Save changes**.

| Supabase template | Subject | File |
|---|---|---|
| Confirm sign up | Confirm your Goose account | `confirm-signup.html` |
| Magic link | Your Goose sign-in link | `magic-link.html` |
| Reset password | Reset your Goose password | `reset-password.html` |

`{{ .ConfirmationURL }}` is filled in by Supabase; leave it as it is. The logo is loaded from https://flightofthegoose.com/img/goose-tile-96.png.
