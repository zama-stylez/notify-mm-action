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

    const finalPayload = await createPayloadJson(inputs)
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

  const payloadJson = await createPayloadJson(inputs)

  if (payloadJson !== '') {
    core.debug(`Will use the PAYLOAD input as is`)
    return payloadJson
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

async function createPayloadJson(inputs) {
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

async function createPushPayload(git) {
  const branch = `[${git.ref_name}](${git.server_url}/${git.repository}/tree/${git.ref_name})`;
  const repo = `[${git.repository}](${git.server_url}/${git.repository})`;
  const viewChanges = `[View Changes](${git.server_url}/${git.repository}/compare/${git.event?.before}...${git.event?.after})`;
  let commitsText = `- Commits ( ${viewChanges} )\n`;
  for (const commit of (git.event?.commits || [])) {
    commitsText += `  - [${commit.id.slice(0, 7)}](${commit.url}) : ${commit.message} - ${commit.author.name}\n`;
  }
  const event = `- Pushed by **${git.triggering_actor}**`;
  const message = `${event} @ ${branch} ( ${repo} )\n${commitsText}`;
  return addPayloadTemplate(message, '#483d8b');
}

module.exports = {
  run
}
