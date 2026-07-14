// Detects and syntax-highlights .NET-style stack traces embedded in a log
// message, e.g.:
//   Error:Error in the application.
//   Source:POLISBusinessService
//   Method:Void PublishBOException(Exception exc, Int64 errorNo)
//   Stack:
//      at Namespace.Class.Method(ArgType arg) in File.cs:line 42
// Falls back to plain text for anything that doesn't look like a trace, so
// ordinary single-line messages are unaffected.

const STACK_FRAME_RE = /^(\s*)at\s+([^\s(][^(]*?)\s*\(([^)]*)\)(.*)$/;
const HEADER_RE = /^(Error|Source|Method|Stack):(\s?)(.*)$/;
const INNER_EXC_RE = /^(\s*)(-{2,}>)\s*(.*)$/;
const EXCEPTION_TYPE_RE = /^([A-Za-z_][\w.]*(?:Exception|Error))(:\s*)(.*)$/;
const LOCATION_RE = /^(\s+in\s+)(.+?)(:line\s+\d+)?$/i;

export function isStackTraceMessage(message) {
  if (!message) return false;
  if (/^(Error|Stack):/m.test(message)) return true;
  return message.split("\n").some((line) => STACK_FRAME_RE.test(line));
}

function renderExceptionText(text, key) {
  const excMatch = EXCEPTION_TYPE_RE.exec(text);
  if (!excMatch) return <span key={key}>{text}</span>;
  const [, type, sep, rest] = excMatch;
  return (
    <span key={key}>
      <span className="st-exc-type">{type}</span>
      <span className="st-punc">{sep}</span>
      <span className="st-exc-msg">{rest}</span>
    </span>
  );
}

function renderLine(line, key) {
  let m = HEADER_RE.exec(line);
  if (m) {
    const [, label, sep, value] = m;
    return (
      <span key={key} className="st-line">
        <span className={`st-header-label${label === "Error" ? " st-header-error" : ""}`}>{label}:</span>
        {sep}
        {value && (EXCEPTION_TYPE_RE.test(value) ? renderExceptionText(value, `${key}-v`) : (
          <span className="st-header-value">{value}</span>
        ))}
      </span>
    );
  }

  m = STACK_FRAME_RE.exec(line);
  if (m) {
    const [, indent, call, args, rest] = m;
    const lastDot = call.lastIndexOf(".");
    const namespace = lastDot >= 0 ? call.slice(0, lastDot + 1) : "";
    const method = lastDot >= 0 ? call.slice(lastDot + 1) : call;
    const locMatch = LOCATION_RE.exec(rest);
    return (
      <span key={key} className="st-line st-frame">
        {indent}
        <span className="st-kw">at</span>{" "}
        {namespace && <span className="st-namespace">{namespace}</span>}
        <span className="st-method">{method}</span>
        <span className="st-punc">(</span>
        <span className="st-args">{args}</span>
        <span className="st-punc">)</span>
        {locMatch ? (
          <>
            <span className="st-kw">{locMatch[1]}</span>
            <span className="st-namespace">{locMatch[2]}</span>
            {locMatch[3] && <span className="st-punc">{locMatch[3]}</span>}
          </>
        ) : (
          rest
        )}
      </span>
    );
  }

  m = INNER_EXC_RE.exec(line);
  if (m) {
    const [, indent, arrow, rest] = m;
    return (
      <span key={key} className="st-line">
        {indent}
        <span className="st-arrow">{arrow}</span>{" "}
        {renderExceptionText(rest, `${key}-e`)}
      </span>
    );
  }

  if (EXCEPTION_TYPE_RE.test(line)) {
    return (
      <span key={key} className="st-line">
        {renderExceptionText(line, key)}
      </span>
    );
  }

  return (
    <span key={key} className="st-line">
      {line}
    </span>
  );
}

// Returns an array of React nodes (with embedded "\n" text) suitable as
// children of a <pre>. Caller should gate this behind isStackTraceMessage
// and fall back to the raw string otherwise.
export function renderStackTrace(message) {
  const lines = message.split("\n");
  const nodes = [];
  lines.forEach((line, i) => {
    if (i > 0) nodes.push("\n");
    nodes.push(renderLine(line, i));
  });
  return nodes;
}

export default function FormattedMessage({ message }) {
  if (!isStackTraceMessage(message)) return message;
  return renderStackTrace(message);
}
