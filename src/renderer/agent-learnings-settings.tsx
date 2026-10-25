import { useEffect, useState } from "react";
import {
  AGENT_PREFERENCE_MAX_LENGTH,
  type AgentLearnings,
} from "../shared/agent-learnings.js";
import {
  addAgentPreference,
  deleteAgentPreference,
  deleteAgentSkill,
  getAgentLearnings,
  updateAgentPreference,
} from "./api.js";
import { t } from "./i18n.js";
import { useReadyRuntimeGeneration } from "./runtime-connection.js";

/** Review and edit lessons the agent saved with the remember tool. */
export function AgentLearningsSettings() {
  const serviceGeneration = useReadyRuntimeGeneration();
  const [learnings, setLearnings] = useState<AgentLearnings>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<{ id: string; text: string }>();

  useEffect(() => {
    let disposed = false;
    void getAgentLearnings()
      .then((next) => {
        if (disposed) return;
        setLearnings(next);
        setError(undefined);
      })
      .catch((cause) => {
        if (!disposed) setError(errorMessage(cause));
      });
    return () => {
      disposed = true;
    };
  }, [serviceGeneration]);

  async function mutate(
    operation: () => Promise<AgentLearnings>,
  ): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    setError(undefined);
    try {
      setLearnings(await operation());
      return true;
    } catch (cause) {
      setError(errorMessage(cause));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    const text = draft.trim();
    if (!text) return;
    if (await mutate(() => addAgentPreference(text))) setDraft("");
  }

  async function saveEdit() {
    if (!editing?.text.trim()) return;
    if (await mutate(() => updateAgentPreference(editing.id, editing.text)))
      setEditing(undefined);
  }

  function removePreference(id: string) {
    if (!window.confirm(t("agentLearnings.confirmDeletePreference"))) return;
    void mutate(() => deleteAgentPreference(id));
  }

  function removeSkill(name: string) {
    if (!window.confirm(t("agentLearnings.confirmDeleteSkill", { name })))
      return;
    void mutate(() => deleteAgentSkill(name));
  }

  if (!learnings) {
    return (
      <section className="settings-panel settings-overview-panel">
        <p className={error ? "settings-error" : "settings-loading"}>
          {error ?? t("agentLearnings.loading")}
        </p>
      </section>
    );
  }

  return (
    <section className="settings-panel settings-overview-panel settings-agent-learnings">
      <header className="settings-panel-header">
        <h3>{t("agentLearnings.title")}</h3>
      </header>
      <p className="settings-agent-learnings-intro">
        {t("agentLearnings.description")}
      </p>

      <section className="settings-search-section">
        <div className="settings-search-section-header">
          <h4>{t("agentLearnings.preferences")}</h4>
          <p>{t("agentLearnings.preferencesDescription")}</p>
        </div>
        {learnings.preferences.length ? (
          <ul className="agent-learnings-list">
            {learnings.preferences.map((preference) => (
              <li className="agent-learnings-item" key={preference.id}>
                {editing?.id === preference.id ? (
                  <div className="agent-learnings-edit">
                    <input
                      className="settings-search-input"
                      value={editing.text}
                      maxLength={AGENT_PREFERENCE_MAX_LENGTH}
                      disabled={busy}
                      onChange={(event) =>
                        setEditing({ ...editing, text: event.target.value })
                      }
                    />
                    <div className="agent-learnings-actions">
                      <button
                        className="settings-primary-button"
                        type="button"
                        disabled={busy || !editing.text.trim()}
                        onClick={() => void saveEdit()}
                      >
                        {t("agentLearnings.save")}
                      </button>
                      <button
                        className="settings-secondary-button"
                        type="button"
                        disabled={busy}
                        onClick={() => setEditing(undefined)}
                      >
                        {t("agentLearnings.cancel")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="agent-learnings-text">
                      <span>{preference.text}</span>
                      {preference.projectName ? (
                        <small>
                          {t("agentLearnings.fromProject", {
                            name: preference.projectName,
                          })}
                        </small>
                      ) : null}
                    </div>
                    <div className="agent-learnings-actions">
                      <button
                        className="settings-secondary-button"
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          setEditing({
                            id: preference.id,
                            text: preference.text,
                          })
                        }
                      >
                        {t("agentLearnings.edit")}
                      </button>
                      <button
                        className="settings-secondary-button"
                        type="button"
                        disabled={busy}
                        onClick={() => removePreference(preference.id)}
                      >
                        {t("agentLearnings.delete")}
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="settings-agent-learnings-empty">
            {t("agentLearnings.noPreferences")}
          </p>
        )}
        <form
          className="agent-learnings-add"
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
        >
          <input
            className="settings-search-input"
            value={draft}
            maxLength={AGENT_PREFERENCE_MAX_LENGTH}
            disabled={busy}
            placeholder={t("agentLearnings.addPlaceholder")}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button
            className="settings-primary-button"
            type="submit"
            disabled={busy || !draft.trim()}
          >
            {t("agentLearnings.add")}
          </button>
        </form>
      </section>

      <section className="settings-search-section">
        <div className="settings-search-section-header">
          <h4>{t("agentLearnings.skills")}</h4>
          <p>{t("agentLearnings.skillsDescription")}</p>
        </div>
        {learnings.skills.length ? (
          <ul className="agent-learnings-list">
            {learnings.skills.map((skill) => (
              <li className="agent-learnings-item" key={skill.name}>
                <div className="agent-learnings-text">
                  <strong>{skill.name}</strong>
                  <span>{skill.description}</span>
                  {skill.projectName ? (
                    <small>
                      {t("agentLearnings.fromProject", {
                        name: skill.projectName,
                      })}
                    </small>
                  ) : null}
                </div>
                <div className="agent-learnings-actions">
                  <button
                    className="settings-secondary-button"
                    type="button"
                    disabled={busy}
                    onClick={() => removeSkill(skill.name)}
                  >
                    {t("agentLearnings.delete")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="settings-agent-learnings-empty">
            {t("agentLearnings.noSkills")}
          </p>
        )}
      </section>

      {error ? (
        <p className="settings-error" role="alert">
          {error}
        </p>
      ) : null}
      {busy ? (
        <p className="settings-loading">{t("agentLearnings.saving")}</p>
      ) : null}
    </section>
  );
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
