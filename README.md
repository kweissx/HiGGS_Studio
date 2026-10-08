# My Higgsfield Studio

A simple, private studio for making images and videos with the Higgsfield API, pay as you go.
It runs on your own computer: you open it in your browser, pick a model, write a prompt and press **Generate**.

- Image models: SOUL V2, SOUL, Grok Image 2.0, Ideogram 4.0
- Genjutsu: motion transfer, object swap and restyle (upload your own video)
- Video models: Kling 3.0, Seedance 2.0, Wan 2.6, Kling 2.5 Turbo, Hailuo 2.3 (text to video and image to video)
- **Any model**: the "Any model" tab can call any of the 80+ Higgsfield models by pasting its endpoint from the docs
- See the **price before you generate**, plus what you've spent today, this month and in total, and how much disk space your creations use
- Rename your Studio: click its name at the top left
- Every result is downloaded into the `outputs` folder automatically (Higgsfield deletes its copies after about 7 days)

---

## Step 1. Get your Higgsfield API key (one time)

1. Go to **[console.higgsfield.ai](https://console.higgsfield.ai)** and sign in.
2. **Add funds** (Billing). Pay as you go: you only pay for successful generations. Failed or blocked ones are refunded. Credits expire one year after you add them.
3. **Create an API key.** You get two parts: a **key ID** and a **key secret**. Copy both into a private note on your computer right away; the secret may only be shown once.

> Never paste your key in a chat, an email, a screenshot or on GitHub. If it ever leaks, delete it in the console and create a new one.

## Step 2. Install Node.js (one time)

1. Go to **[nodejs.org](https://nodejs.org)** and download the **LTS** version.
2. Open the installer and click Next/Continue until it finishes. Keep the default options.

## Step 3. Download the Studio (one time)

1. On this GitHub page, click the green **Code** button, then **Download ZIP**.
2. Unzip it (Windows: right-click → *Extract All*; Mac: double-click). Move the folder somewhere easy, like Documents.

## Step 4. Start the Studio (every time you want to use it)

- **Windows:** double-click **`Start Studio (Windows).bat`**. If Windows shows "Windows protected your PC", click *More info* → *Run anyway*.
- **Mac:** right-click **`Start Studio (Mac).command`** → *Open* → *Open* (only needed the first time; after that a double-click works).

A small black window opens and your browser opens **http://localhost:5173**. Keep the black window open while you use the Studio; close it when you're done.

## Step 5. Add your key in the Studio (one time)

The first time, a **Settings** window appears. Paste the **key ID** and **key secret**, press **Save**, and you should see *"Connected. Your key works."*

The key is saved in a file called `.env` inside the Studio folder. It stays on your computer, the web page never sees it again, and it is excluded from GitHub.

## Step 6. Create

1. Pick **Image**, **Video** or **Any model** at the top.
2. Choose a model, write your prompt, add an image or video if the model needs one, and press **Generate**. Genjutsu is in the **Video** tab.
3. Your creation appears on the right when it's ready. Images take seconds, videos can take a few minutes.
4. Check your balance and spending any time with **Balance & usage** (top right), which opens the Higgsfield Console.

---

## Using "Any model"

1. Open the model's page in the [Higgsfield model docs](https://docs.higgsfield.ai/docs/models) and pick a workflow.
2. Copy its endpoint (the part after `https://api.higgsfield.ai`, e.g. `/kling-video/v3.0/pro/text-to-video`) into **Endpoint**.
3. Write your prompt. Add other settings from the docs as JSON, e.g. `{"duration": 5, "aspect_ratio": "16:9"}`.
4. If the model takes an image, upload it and type the name of its image setting (usually `image_url`).

## Troubleshooting

| What you see | What to do |
| --- | --- |
| "Your API key was not accepted" | Open Settings and paste the key ID and secret again. Make sure the key and your funds are in the same workspace in the console (personal or team). |
| "Not enough credits" | Add funds in the Higgsfield Console. |
| "Node.js is not installed yet" | Do Step 2, then start the Studio again. |
| The browser didn't open | Open http://localhost:5173 yourself while the black window is open. |
| A video is stuck on "Creating…" | Some take several minutes. You can close the browser; it picks up where it left off next time. |

## For the technically curious

- `server.js` is a tiny Node.js server with no extra packages. It keeps your key, sends requests to `https://api.higgsfield.ai`, polls for results, and saves files to `outputs/`. It only listens on your own computer (`127.0.0.1`).
- `public/` is the web page. `public/models.js` lists the built-in models; add one by copying an entry and matching its docs page.
- Run it from a terminal with `npm start` (or `node server.js`). Set `PORT` to use a different port.
