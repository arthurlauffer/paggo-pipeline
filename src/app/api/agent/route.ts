import { NextRequest, NextResponse } from 'next/server'
import type { Part } from '@google/generative-ai'
import {
  GoogleGenerativeAI, SYSTEM_PROMPT, TOOL_DECLARATIONS, WRITE_TOOLS,
  executeRead, previewWrite,
} from '@/lib/agent-tools'

export const dynamic = 'force-dynamic'

// A write action the agent proposed during this turn, awaiting user confirmation.
type PendingAction = {
  id: string
  name: string
  args: Record<string, unknown>
  title: string
  description: string
  warnings?: string[]
}

export async function POST(req: NextRequest) {
  const { messages } = await req.json()

  const apiKey = process.env.GOOGLE_AI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'GOOGLE_AI_API_KEY não configurada. Adicione no arquivo .env.local e reinicie o servidor.' },
      { status: 500 }
    )
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: SYSTEM_PROMPT,
      tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
    })

    const history = messages.slice(0, -1).map((m: { role: string; content: string }) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }] as Part[],
    }))

    const chat        = model.startChat({ history })
    const lastMessage = messages[messages.length - 1].content

    let currentParts: string | Part[] = lastMessage
    const pendingActions: PendingAction[] = []

    for (let i = 0; i < 10; i++) {
      const result   = await chat.sendMessage(currentParts)
      const response = result.response
      const parts    = response.candidates?.[0]?.content?.parts ?? []
      const fnCalls  = parts.filter((p: Part) => !!p.functionCall)

      if (fnCalls.length === 0) {
        return NextResponse.json({
          role: 'assistant',
          content: response.text(),
          pendingActions: pendingActions.length ? pendingActions : undefined,
        })
      }

      const fnResponses: Part[] = await Promise.all(
        fnCalls.map(async (p: Part) => {
          const { name, args } = p.functionCall!
          const typedArgs = (args ?? {}) as Record<string, unknown>

          // Read tools run for real and return live data to the model.
          if (!WRITE_TOOLS.has(name)) {
            const toolResult = await executeRead(name, typedArgs)
            return { functionResponse: { name, response: toolResult as object } } as Part
          }

          // Write tools NEVER execute here. They are validated into a preview
          // and queued for explicit user confirmation (human-in-the-loop).
          const preview = await previewWrite(name, typedArgs)
          if (!preview.ok) {
            return {
              functionResponse: {
                name,
                response: { status: 'preview_failed', willCommit: false, error: preview.error },
              },
            } as Part
          }

          const id = `act-${pendingActions.length + 1}-${Math.random().toString(36).slice(2, 6)}`
          pendingActions.push({
            id, name, args: typedArgs,
            title: preview.title, description: preview.description, warnings: preview.warnings,
          })

          return {
            functionResponse: {
              name,
              response: {
                status: 'preview',
                willCommit: false,
                note: 'Ação PROPOSTA, ainda NÃO executada. Aguardando o usuário clicar em "Confirmar e executar". NÃO diga que já foi feita.',
                preview: { title: preview.title, description: preview.description, warnings: preview.warnings ?? [] },
              },
            },
          } as Part
        })
      )
      currentParts = fnResponses
    }

    return NextResponse.json({
      role: 'assistant',
      content: 'Limite de iterações atingido. Tente novamente.',
      pendingActions: pendingActions.length ? pendingActions : undefined,
    })
  } catch (err: unknown) {
    console.error('[agent] Error:', err)
    const message = err instanceof Error ? err.message : String(err)
    const userMessage = message.includes('429') ? 'Limite de requisições da API atingido. Aguarde alguns segundos e tente novamente.'
      : message.includes('403') || message.includes('API key') ? 'Chave de API inválida ou sem permissão. Verifique o GOOGLE_AI_API_KEY no .env.local.'
      : message.includes('404') ? 'Modelo não disponível para esta chave de API.'
      : `Erro na API Gemini: ${message.slice(0, 200)}`
    return NextResponse.json({ error: userMessage }, { status: 500 })
  }
}
