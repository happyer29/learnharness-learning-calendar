# Learning calendar for LearnHarness

A community plugin that adds a GitHub-style activity calendar to the LearnHarness sidebar. Each square represents one day in your local time zone. Select a square to see the sessions you worked on, then select a session to reopen it.

## Install

Requires LearnHarness 0.6.0 or a compatible later version. The files in `dist/` are ready to run without a build or dependency installation.

1. Open **Settings → Community plugins** in LearnHarness and find the plugins directory.
2. Download [the installable plugin ZIP](https://github.com/happyer29/learnharness-learning-calendar/raw/refs/heads/main/downloads/learning-calendar.zip), unzip it, and move the extracted `learning-calendar` folder into that directory. Alternatively, run `git clone https://github.com/happyer29/learnharness-learning-calendar.git learning-calendar` from the plugins directory. The final path should end in `plugins/learning-calendar/dist/manifest.json`.
3. Click **Refresh plugins**, enable **Learning calendar**, and open it from the sidebar.

## Reading the calendar

Green squares show recorded learner messages, side-chat messages, and submitted answers or practice work. Color intensity reflects the number of actions. A blank day within the recorded period means no learner action was saved. Passive reading leaves no record. Dates before your first activity and dates in the future have their own markings.

Choose a year to see its active days, completed days without activity, and total actions. The current streak counts consecutive active days through today, or through yesterday while today is still open.

The plugin reads saved sessions on your device through LearnHarness. It does not change session records or send them to a network service.

## License

Released under the [MIT License](LICENSE).
