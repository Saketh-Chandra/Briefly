import keytar from 'keytar'

const SERVICE = 'Briefly'

export async function getApiKey(account: string): Promise<string | null> {
  return keytar.getPassword(SERVICE, account)
}

export async function setApiKey(account: string, key: string): Promise<void> {
  await keytar.setPassword(SERVICE, account, key)
}

export async function deleteApiKey(account: string): Promise<void> {
  await keytar.deletePassword(SERVICE, account)
}
