/** Public operator choices. Credentials are supplied only to bootstrap/deploy. */
interface DeploymentSettings {
	production: { branch: 'master'; reviewers: Array<string> }
	preview: { reviewers: Array<string> }
}

const settings: DeploymentSettings = {
	production: { branch: 'master', reviewers: [] },
	preview: { reviewers: [] }
}

export default settings
