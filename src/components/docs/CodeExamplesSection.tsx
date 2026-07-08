import { CodeBlock } from '@/components/ui/code-block';
import { codeExamples } from '@/lib/code-examples';

export function CodeExamplesSection() {
  return (
    <section id="code-examples" className="mt-20 scroll-mt-20">
      <h2 className="mb-4 text-5xl font-bold">Code Examples</h2>
      <p className="mb-12 text-lg text-muted-foreground">
        Ready-to-use patterns for common use cases.
      </p>
      <div className="space-y-12">
        {/* Basic Usage */}
        <div id="example-basic-fallback" className="space-y-3 md:space-y-4 scroll-mt-20">
          <h3 className="text-2xl font-semibold">Basic Usage</h3>
          <p className="text-muted-foreground">
            Call <code>getModelIds()</code> with no params to use your saved key configuration
            automatically, then try each model until one succeeds.
          </p>
          <CodeBlock code={codeExamples.basicUsageDefault()} copyLabel="Copy" />
        </div>

        {/* One-off API Call */}
        <div id="example-one-off" className="space-y-3 md:space-y-4 scroll-mt-20">
          <h3 className="text-2xl font-semibold">One-off API Call</h3>
          <p className="text-muted-foreground">
            Simple single prompt completion - perfect for scripts, CLI tools, or serverless
            functions.
          </p>
          <CodeBlock code={codeExamples.oneOffCall} copyLabel="Copy" />
        </div>

        {/* Chatbot */}
        <div id="example-chatbot" className="space-y-3 md:space-y-4 scroll-mt-20">
          <h3 className="text-2xl font-semibold">Chatbot</h3>
          <p className="text-muted-foreground">
            Multi-turn conversation with message history - ideal for chat interfaces.
          </p>
          <CodeBlock code={codeExamples.chatbot} copyLabel="Copy" />
        </div>

        {/* Tool Calling */}
        <div id="example-tool-calling" className="space-y-3 md:space-y-4 scroll-mt-20">
          <h3 className="text-2xl font-semibold">Tool Calling</h3>
          <p className="text-muted-foreground">
            Let the model call functions - for agents, data fetching, or structured outputs.
          </p>
          <CodeBlock code={codeExamples.toolCalling} copyLabel="Copy" />
        </div>
      </div>
    </section>
  );
}
