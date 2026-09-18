# Local load testing (JMeter)

Stresses the full personal-loan customer journey through `api-gateway` (port 8080):
register → verify OTP → start application → save all 9 wizard sections → affordability
check → save the result → submit. This exercises `auth-service`, `application-service`,
and `affordability-service` together, the same way a real customer would.

Test plan: `personal-loan-journey.jmx`. Run everything from the **repo root** (not from
inside `loadtest/`) — the pool file path below is relative to the current directory.

## One-time setup

1. Install Apache JMeter (already done on this machine via `winget install --id DEVCOM.JMeter`,
   installed to `%LOCALAPPDATA%\Programs\JMeter`).
2. **Important**: JMeter 5.6.3's bundled Groovy engine cannot compile scripts under Java 26
   (`Unsupported class file major version 70`) — the JSR223 samplers in this plan (used to
   register test users and capture the affordability result) will fail silently otherwise.
   winget also installed a compatible JDK 21 as JMeter's declared dependency
   (`Microsoft.OpenJDK.21`, typically at
   `C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot`) — point `JAVA_HOME` at that JDK when
   running JMeter, not your system default Java. All commands below assume this.
3. Start the Java backend stack (all 7+ services, including `api-gateway` on 8080) and confirm
   it's reachable — this test plan does not start anything for you.

## Running a test

From the repo root, in PowerShell:

```powershell
$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
$jmeter = "$env:LOCALAPPDATA\Programs\JMeter\bin\jmeter.bat"

# Clean up any previous run's output (JMeter refuses to overwrite an existing results file)
Remove-Item -Recurse -Force loadtest\results.jtl, loadtest\report -ErrorAction SilentlyContinue

& $jmeter -n -t loadtest\personal-loan-journey.jmx `
  -JTHREADS=20 -JRAMPUP=15 -JLOOPS=5 -JPOOL_SIZE=10 `
  -l loadtest\results.jtl -e -o loadtest\report
```

Then open `loadtest\report\index.html` in a browser — JMeter's standard HTML Dashboard
Report: response-time percentiles, throughput over time, error breakdown by sampler, APDEX.
This is the recommended way to review results; running JMeter's GUI live during an actual
load run adds its own overhead and skews the numbers you're trying to measure.

## Tunable parameters (all `-J` overrides, no need to edit the .jmx)

| Property | Default | Meaning |
|---|---|---|
| `HOST` | `localhost` | Gateway host |
| `PORT` | `8080` | Gateway port |
| `POOL_SIZE` | `10` | How many fresh test customers to register once before the load phase |
| `THREADS` | `10` | Concurrent virtual users in the load phase |
| `RAMPUP` | `10` | Seconds to spin all threads up over |
| `LOOPS` | `5` | Full journeys each thread repeats |
| `POOL_FILE` | `loadtest/user-pool.csv` | Where the pre-registered user pool is written/read |

Total journeys in the load phase = `THREADS × LOOPS`. Each journey is ~13 HTTP calls, so
`THREADS=20, LOOPS=5` ≈ 1,300 requests across `auth`/`application`/`affordability`-service.

## Why a separate "setup" phase registers users first

`api-gateway`'s rate limiter (S5, `ARCHITECTURE_REVIEW_GAPS.md`) caps `/api/auth/login/**`
and `/api/auth/register/**` at **10 requests/minute per client IP**. A real load test hitting
those endpoints on every iteration would mostly measure the rate limiter, not the wizard/
affordability code paths. So this plan registers `POOL_SIZE` customers **once**, in a JMeter
"setUp Thread Group" that runs before the main load phase and saves each token to
`user-pool.csv`; the load phase reads from that pool (recycling round-robin across threads)
and never touches `/register` or `/login` again.

The setup phase and the load phase also each send a distinct `X-Forwarded-For` header per
JMeter thread (`203.0.113.<thread number>`, an RFC 5737 documentation-only address range) —
the rate limiter trusts that header the same way a real load balancer's would, so each
simulated client gets its own bucket instead of every thread in this one JMeter process
sharing a single bucket keyed off `127.0.0.1`. If you deliberately want to see the rate
limiter reject traffic, set `POOL_SIZE` above 10 (the setup phase paces itself with a 300ms
timer, so it'll take a bit longer, then you'll see 429s in the report as expected).

## What's covered vs. not

Covered: `auth-service` (register/OTP), `application-service` (start, 9 wizard sections,
submit), `affordability-service` (check + save result). Not covered: `document-service`
(offer-pack generation), `product-service`/product selection, `notification-service`,
staff-side decisioning (approve/decline/disbursement) — none of these are in the customer's
own journey up to submission. Extending this plan to cover them means adding more HTTP
samplers after "submit" using the same pattern (copy an existing `HTTPSamplerProxy` block,
change path/method/body).

## Extending to the worker (Cloudflare) stack instead

Not built here — this plan targets the Java stack specifically, since that's the production
target (per the S5 tracker note, the Cloudflare Worker is this sandbox only). To point it at
`wrangler dev` instead, the endpoint shapes are nearly identical (`worker/src/routes/*.ts`
mirrors the Java controllers path-for-path) — override `HOST`/`PORT` to wherever `wrangler
dev` is listening, but note the worker's JWT/OTP flow and rate limiting are implemented
differently (D1-backed, no `api-gateway`), so treat this as a starting point, not a drop-in.
