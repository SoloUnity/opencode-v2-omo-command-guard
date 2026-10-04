import assert from "node:assert/strict"
import test from "node:test"
import plugin from "../index.js"

const commands = ["deepwork", "reflect", "loop", "interview"]
const marker = (command, text = "test request") => command === "interview"
  ? `<omos-interview-command>${text}</omos-interview-command>`
  : `<omos-cmd-command data-name="${command}">${text}</omos-cmd-command>`

async function harness(agent = "build") {
  const hooks = new Map()
  const state = { agent, reads: 0, admitted: 0, dispatched: 0, notices: [] }
  await plugin.setup({
    session: {
      async get({ sessionID }) {
        assert.equal(sessionID, "ses_test")
        state.reads++
        return { agent: state.agent }
      },
      async hook(name, callback) {
        hooks.set(name, callback)
      },
      async synthetic(input) {
        state.notices.push(input)
      },
    },
  })
  return {
    state,
    async admit(text) {
      const event = { sessionID: "ses_test", prompt: { text, files: [{ uri: "file:///test.txt" }] } }
      const original = structuredClone(event)
      await hooks.get("prompt")(event)
      state.admitted++
      assert.deepEqual(event, original)
    },
    async dispatch(messages) {
      const event = { sessionID: "ses_test", agent: state.agent, messages }
      const original = structuredClone(event)
      await hooks.get("context")(event)
      state.dispatched++
      assert.deepEqual(event, original)
    },
  }
}

for (const command of commands) {
  test(`/${command} is rejected before native prompt admission`, async () => {
    for (const agent of ["plan", "build", "general", "explore", "librarian", undefined]) {
      const host = await harness()
      host.state.agent = agent
      await assert.rejects(host.admit(marker(command)), new RegExp(`Switch to Orchestrator to use /${command}`))
      assert.equal(host.state.admitted, 0)
      assert.deepEqual(host.state.notices, [{
        sessionID: "ses_test",
        text: `Switch to Orchestrator to use /${command}.`,
        resume: false,
      }])
    }
  })

  test(`/${command} reaches OMO when Orchestrator is selected`, async () => {
    const host = await harness("orchestrator")
    const text = marker(command, "first line\nsecond line")
    await host.admit(text)
    await host.dispatch([{ role: "user", content: [{ type: "text", text }] }])
    assert.equal(host.state.admitted, 1)
    assert.equal(host.state.dispatched, 1)
    assert.deepEqual(host.state.notices, [])
  })

  test(`/${command} cannot start after switching from Orchestrator to Build`, async () => {
    const host = await harness("orchestrator")
    const text = marker(command)
    await host.admit(text)
    host.state.agent = "build"
    await assert.rejects(host.dispatch([{
      role: "user",
      content: [
        { type: "text", text: text.slice(0, 15) },
        { type: "file", uri: "file:///test.txt" },
        { type: "text", text: text.slice(15) },
      ],
    }]), /Switch to Orchestrator/)
    assert.equal(host.state.dispatched, 0)
  })
}

test("ordinary prompts, quoted markers, and other commands pass without a session lookup", async () => {
  const host = await harness()
  for (const text of ["Explain this function", "/deepwork", `Explain ${marker("loop")}`, `\`\`\`\n${marker("reflect")}\n\`\`\``, marker("other")]) {
    await host.admit(text)
    await host.dispatch([{ role: "user", content: [{ type: "text", text }] }])
  }
  assert.equal(host.state.reads, 0)
  assert.equal(host.state.dispatched, 5)
})

test("old workflow markers do not block later native turns or assistant messages", async () => {
  const host = await harness()
  const old = { role: "user", content: [{ type: "text", text: marker("deepwork") }] }
  await host.dispatch([old, { role: "user", content: [{ type: "text", text: "Continue with Build" }] }])
  await host.dispatch([{ role: "assistant", content: old.content }])
  await host.dispatch([])
  assert.equal(host.state.dispatched, 3)
})
