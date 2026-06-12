function parseDeclaration(rawDeclaration) {
  const [rawProp, ...rawValueParts] = rawDeclaration.split(':')
  if (!rawProp || rawValueParts.length === 0) return null

  const prop = rawProp.trim()
  let value = rawValueParts.join(':').trim()
  if (!prop || !value) return null

  const important = /\s*!important\s*$/i.test(value)
  value = value.replace(/\s*!important\s*$/i, '').trim()

  return { prop, value, important }
}

export function parse(css) {
  const body = String(css).replace(/^[^{]*\{/, '').replace(/\}\s*$/, '')
  const declarations = body.split(';').map(parseDeclaration).filter(Boolean)

  return {
    nodes: [
      {
        nodes: declarations
      }
    ]
  }
}

export default { parse }
