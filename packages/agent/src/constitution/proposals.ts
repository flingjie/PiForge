import type { AmendmentProposal, Constitution } from "./types.js";

let proposalCounter = 0;

export function createProposal(
  target: AmendmentProposal["target"],
  action: AmendmentProposal["action"],
  change: Record<string, unknown>,
  rationale: string,
  source: string,
): AmendmentProposal {
  proposalCounter++;
  return {
    id: `amend-${proposalCounter}-${Date.now()}`,
    proposedAt: new Date().toISOString(),
    target,
    action,
    change,
    rationale,
    source,
    status: "proposed",
  };
}

export function applyProposal(
  constitution: Constitution,
  proposal: AmendmentProposal,
): Constitution {
  const updated = { ...constitution };

  switch (proposal.target) {
    case "principle": {
      const principles = [...constitution.principles];
      if (proposal.action === "add") {
        principles.push(proposal.change as unknown as Constitution["principles"][number]);
      } else if (proposal.action === "modify") {
        const order = proposal.change.order as number;
        const idx = principles.findIndex((p) => p.order === order);
        if (idx >= 0) {
          principles[idx] = {
            ...principles[idx],
            ...(proposal.change as Record<string, unknown>),
          } as unknown as Constitution["principles"][number];
        }
      } else if (proposal.action === "remove") {
        const order = proposal.change.order as number;
        updated.principles = principles.filter((p) => p.order !== order);
        return updated;
      }
      updated.principles = principles;
      break;
    }

    case "rubric": {
      const rubric = [...constitution.rubric];
      if (proposal.action === "add") {
        rubric.push(proposal.change as unknown as Constitution["rubric"][number]);
      } else if (proposal.action === "modify") {
        const key = proposal.change.key as string;
        const idx = rubric.findIndex((r) => r.key === key);
        if (idx >= 0) {
          rubric[idx] = {
            ...rubric[idx],
            ...(proposal.change as Record<string, unknown>),
          } as unknown as Constitution["rubric"][number];
        }
      } else if (proposal.action === "remove") {
        const key = proposal.change.key as string;
        updated.rubric = rubric.filter((r) => r.key !== key);
        return updated;
      }
      updated.rubric = rubric;
      break;
    }

    case "agent_pool": {
      const pool = [...constitution.agentPool];
      if (proposal.action === "add") {
        pool.push(proposal.change as unknown as Constitution["agentPool"][number]);
      } else if (proposal.action === "modify") {
        const persona = proposal.change.persona as string;
        const idx = pool.findIndex((a) => a.persona === persona);
        if (idx >= 0) {
          pool[idx] = {
            ...pool[idx],
            ...(proposal.change as Record<string, unknown>),
          } as unknown as Constitution["agentPool"][number];
        }
      } else if (proposal.action === "remove") {
        const persona = proposal.change.persona as string;
        updated.agentPool = pool.filter((a) => a.persona !== persona);
        return updated;
      }
      updated.agentPool = pool;
      break;
    }

    case "agent_rule": {
      const rules = [...constitution.agentPoolRules];
      if (proposal.action === "add") {
        rules.push(proposal.change as unknown as Constitution["agentPoolRules"][number]);
      } else if (proposal.action === "modify") {
        const st = proposal.change.subProblemType as string;
        const idx = rules.findIndex((r) => r.subProblemType === st);
        if (idx >= 0) {
          rules[idx] = {
            ...rules[idx],
            ...(proposal.change as Record<string, unknown>),
          } as unknown as Constitution["agentPoolRules"][number];
        }
      } else if (proposal.action === "remove") {
        const st = proposal.change.subProblemType as string;
        updated.agentPoolRules = rules.filter((r) => r.subProblemType !== st);
        return updated;
      }
      updated.agentPoolRules = rules;
      break;
    }
  }

  return updated;
}

export function serializeProposal(proposal: AmendmentProposal): string {
  const lines = [
    "## Amendment Proposal",
    "",
    `- **ID:** ${proposal.id}`,
    `- **Proposed At:** ${proposal.proposedAt}`,
    `- **Target:** ${proposal.target}`,
    `- **Action:** ${proposal.action}`,
    `- **Status:** ${proposal.status}`,
    `- **Source:** ${proposal.source}`,
    "",
    "### Rationale",
    "",
    proposal.rationale,
    "",
    "### Change",
    "",
    "```json",
    JSON.stringify(proposal.change, null, 2),
    "```",
  ];
  return lines.join("\n");
}
