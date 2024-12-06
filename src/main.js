const core = require('@actions/core')
const http = require('@actions/http-client')
const path = require('path')
const fs = require('fs').promises

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
async function run() {
  try {
    const inputs = {
      webhookURL: core.getInput('MATTERMOST_WEBHOOK_URL', { required: true }),
      channel: core.getInput('MATTERMOST_CHANNEL'),
      username: core.getInput('MATTERMOST_USERNAME'),
      icon: core.getInput('MATTERMOST_ICON_URL'),
      text: core.getInput('TEXT'),
      payload: core.getInput('PAYLOAD'),
      filename: core.getInput('PAYLOAD_FILENAME'),
      githubContext: core.getInput('GITHUB_CONTEXT', { required: true })
    }

    const finalPayload = await generatePayload(inputs)
    core.debug(`${JSON.stringify(finalPayload, undefined, 4)}`)
    await sendNotification(inputs.webhookURL, finalPayload)
  } catch (error) {
    core.setFailed(error.message)
  }
}

async function sendNotification(webhookURL, payload) {
  const client = new http.HttpClient()
  const response = await client.post(webhookURL, JSON.stringify(payload))
  await response.readBody()

  if (response.message.statusCode === 200) {
    core.info('Successfully sent notification!')
  } else {
    core.error(`Unexpected status code: ${response.message.statusCode}`)
    throw new Error(`${response.message.statusMessage}`)
  }
}

async function generatePayload(inputs) {
  const legacyPayloadFilePath = path.join(__dirname, '..', inputs.filename)

  const legacyPayloadFileData = await checkLegacy(legacyPayloadFilePath)
  if (legacyPayloadFileData) {
    return legacyPayloadFileData
  }

  const json = await generateJson(inputs)

  if (json !== '') {
    core.debug(`Will use the PAYLOAD input as is`)
    return json
  } else if (inputs.payload !== '') {
    core.debug(`Will use the PAYLOAD input as is`)
    return JSON.parse(inputs.payload)
  } else if (inputs.text !== '') {
    core.debug('Will use the TEXT input to generate the payload.')

    const payload = {
      channel: inputs.channel,
      username: inputs.username,
      icon_url: inputs.icon,
      text: inputs.text
    }

    return payload
  } else {
    throw new Error('You need to provide TEXT or PAYLOAD input')
  }
}

async function checkLegacy(filePath) {
  try {
    await fs.access(filePath, fs.constants.F_OK)
    const legacyData = await fs.readFile(filePath)
    return legacyData
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EISDIR') {
      core.debug(`File ${filePath} does not exist. Moving along ...`)
      return
    } else {
      throw new Error(`You need to provide a valid readable file: ${error}`)
    }
  }
}

async function generateJson(inputs) {
  try {
    // GitHub Context をパース
    const githubContext = JSON.parse(inputs.githubContext)
    const eventName = githubContext.event_name;
    // console.log(`github: ${inputs.githubContext}`)
    console.log(`Event name: ${eventName}`)


    switch (eventName) {
      case 'push':
        return await createPushPayload(githubContext)
    }

    return ''
  } catch (error) {
    core.setFailed(`Action failed with error: ${error.message}`)
  }
}

async function addPayloadTemplate(text, color) {
  return {
    username: 'github-notification',
    icon_url: 'https://www.iconfinder.com/icons/8725846/download/png/48',
    attachments: [{text, color}]
  }
}

async function createPushPayload(githubContext) {

  const actor = githubContext.triggering_actor;
  const serverUrl = githubContext.server_url;
  const repoJson = githubContext.repository;
  const refName = githubContext.ref_name;
  const commits = githubContext.event?.commits || [];
  const before = githubContext.event?.before;
  const after = githubContext.event?.after;

  const branch = `[${refName}](${serverUrl}/${repoJson}/tree/${refName})`;
  const repo = `[${repoJson}](${serverUrl}/${repoJson})`;
  const diff = `[View Changes](${serverUrl}/${repoJson}/compare/${before}...${after})`;

  let commitsText = `- Commits ( ${diff} )\n`;
  for (const commit of commits) {
    const sha = commit.id.slice(0, 7);
    const messageText = commit.message;
    const commitUrl = commit.url;
    const authorName = commit.author.name;
    commitsText += `  - [${sha}](${commitUrl}) : ${messageText} - ${authorName}\n`;
  }

  const event = `- Pushed by **${actor}**`;
  const text = `${event} @ ${branch} ( ${repo} )\n${commitsText}`;

  return addPayloadTemplate(text, '#483d8b');
}

module.exports = {
  run
}
