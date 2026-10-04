const workflows = new Set(["deepwork", "reflect", "loop"])

function workflowCommand(text) {
  if (typeof text !== "string") return
  if (/^\s*<omos-interview-command>\s*[\s\S]*?\s*<\/omos-interview-command>\s*$/.test(text)) {
    return "interview"
  }
  const match = text.match(/^\s*<omos-cmd-command\s+data-name="([\w.-]+)">[\s\S]*?<\/omos-cmd-command>\s*$/)
  if (match && workflows.has(match[1])) return match[1]
}

function requireOrchestrator(command, agent) {
  if (agent !== "orchestrator") {
    throw new Error(`Switch to Orchestrator to use /${command}.`)
  }
}

export default {
  id: "opencode-v2-omo-command-guard",
  async setup(ctx) {
    // Load before OMO so a rejected marker cannot start a workflow.
    await ctx.session.hook("prompt", async (event) => {
      const command = workflowCommand(event.prompt.text)
      if (!command) return
      const session = await ctx.session.get({ sessionID: event.sessionID })
      try {
        requireOrchestrator(command, session.agent)
      } catch (error) {
        // OMO catches prompt errors. Add a notice without starting the model.
        await ctx.session.synthetic({ sessionID: event.sessionID, text: error.message, resume: false })
        throw error
      }
    })

    // The selected agent can change while an admitted command is in the queue.
    await ctx.session.hook("context", (event) => {
      const trailing = event.messages.at(-1)
      if (trailing?.role !== "user") return
      const text = trailing.content
        .filter((part) => part.type === "text" && typeof part.text === "string")
        .map((part) => part.text)
        .join("")
      const command = workflowCommand(text)
      if (command) requireOrchestrator(command, event.agent)
    })
  },
}
