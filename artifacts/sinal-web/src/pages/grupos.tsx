import { useState, useEffect } from "react";
import { useSearch as useRouteSearch } from "wouter";
import { useGroups, useTopics, useGroupDigest, useSetGroupSupport, useTopic, type Topic } from "@/lib/api";
import { Loader2, Radio, Zap, Bookmark, MessageSquare, Flame, Users, TrendingUp, EyeOff, Eye, ArrowUpRight, Quote } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";

export default function Grupos() {
  const { data: groups, isLoading: loadingG } = useGroups(20);
  const { data: crossGroupTopics, isLoading: loadingCross } = useTopics({
    scope: "group",
    crossgroup: true,
  });
  const { data: groupTopics, isLoading: loadingAll } = useTopics({ scope: "group" });
  const loadingT = loadingCross || loadingAll;
  const setSupport = useSetGroupSupport();
  
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const routeSearch = useRouteSearch();
  useEffect(() => {
    const g = new URLSearchParams(routeSearch).get("g");
    if (g) {
      setSelectedGroup(g);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [routeSearch]);
  const { data: digest, isLoading: loadingDigest } = useGroupDigest(selectedGroup || undefined);
  const { data: topicDetail, isLoading: loadingTopic } = useTopic(selectedTopic?.id);

  // Open a group's digest from inside the topic drawer (switch drawers).
  const openGroupFromTopic = (chatId: string) => {
    setSelectedTopic(null);
    setSelectedGroup(chatId);
  };

  if (loadingG || loadingT) {
    return <div className="flex items-center justify-center h-[calc(100vh-200px)]"><Loader2 className="w-8 h-8 animate-spin text-[var(--accent)]" /></div>;
  }

  const maxGroupMsgs = Math.max(1, ...(groups || []).map(g => g.message_count || 0));

  return (
    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-400">
      <div className="flex items-center gap-[10px] mb-[14px]">
        <h3 className="font-display font-semibold text-[16px] flex items-center gap-[8px]"><Radio className="w-4 h-4 text-[var(--accent)]" /> Pautas em alta — atravessando vários grupos</h3>
        <span className="inline-block text-[11px] text-[var(--muted-2)] border border-[var(--border)] px-[8px] py-[2px] rounded-[20px] font-mono">o mesmo tema bombando em paralelo</span>
      </div>

      <div className="grid grid-cols-3 gap-[14px] mb-[24px]">
        {crossGroupTopics?.slice(0, 3).map((topic, i) => (
          <div key={i} onClick={() => setSelectedTopic(topic)} className="bg-[var(--surface-2)] border border-[var(--border-soft)] rounded-[var(--radius)] p-[16px] transition-[0.16s] cursor-pointer relative overflow-hidden group hover:border-[var(--accent-dim)] hover:-translate-y-0.5">
            <div className="absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-[var(--accent)] to-[var(--accent-dim)] opacity-70 group-hover:opacity-100" />
            <div className="font-semibold text-[14.5px] mb-[9px] leading-[1.3] pl-[6px]">{topic.label} <span className="inline-flex items-center gap-[6px] font-mono text-[11px] text-[var(--accent)] bg-[var(--accent-glow)] px-[9px] py-[3px] rounded-[20px] ml-[6px]"><Zap className="w-3 h-3" /> em {topic.group_count} grupos</span></div>
            <div className="text-[12px] text-[var(--muted)] leading-[1.5] border-l-2 border-[var(--border)] pl-[10px] m-[10px_0_0_6px] line-clamp-2">
              “{topic.summary || 'Resumo não disponível.'}”
            </div>
            <div className="flex items-center justify-between mt-[13px] pl-[6px] text-[11.5px] text-[var(--muted-2)]">
              <span className="text-[10.5px] text-[var(--muted)] bg-[var(--surface-3)] px-[7px] py-[2px] rounded-[6px] font-mono">{topic.person_count ?? 0} pessoas</span>
              <span className="text-[var(--ok)] font-mono inline-flex items-center gap-[4px]"><TrendingUp className="w-3 h-3" /> {topic.message_count} msgs</span>
            </div>
            <button onClick={(e) => e.stopPropagation()} className="text-[11px] font-sans font-semibold text-[var(--accent)] bg-[var(--accent-glow)] border-none px-[10px] py-[4px] rounded-[7px] cursor-pointer inline-flex items-center gap-[5px] transition-[0.14s] whitespace-nowrap mt-[12px] ml-[6px] hover:bg-[rgba(53,224,216,0.22)]"><Bookmark className="w-3 h-3" /> salvar</button>
          </div>
        ))}
        {!crossGroupTopics?.length && <div className="col-span-3 py-8 text-center text-[var(--muted-2)] text-[13px]">Nenhuma pauta cruzada detectada.</div>}
      </div>

      <div className="grid grid-cols-[1.4fr_1fr] gap-[16px] mb-[16px]">
        {/* O que estão discutindo agora */}
        <div className="bg-[var(--surface)] border border-[var(--border-soft)] rounded-[var(--radius)] p-[22px]">
          <div className="flex items-center justify-between mb-[16px]">
            <h3 className="text-[13px] font-semibold text-[var(--muted)] uppercase tracking-[0.02em] flex items-center gap-[7px]"><MessageSquare className="w-3.5 h-3.5" /> O que estão discutindo agora</h3>
            <span className="inline-block text-[11px] text-[var(--muted-2)] border border-[var(--border)] px-[8px] py-[2px] rounded-[20px] ml-[8px] font-mono">todas as conversas</span>
          </div>
          <div className="flex flex-col">
            {groupTopics?.map((topic, i) => (
              <div key={i} onClick={() => setSelectedTopic(topic)} className="flex items-start gap-[13px] py-[13px] border-b border-[var(--border-soft)] last:border-none cursor-pointer transition-[0.12s] hover:bg-[var(--surface-2)] -mx-[10px] px-[10px] rounded-[8px]">
                <span className="font-mono text-[12px] text-[var(--muted-2)] w-[18px] pt-[2px]">{(i + 1).toString().padStart(2, '0')}</span>
                <div className="flex-1">
                  <div className="text-[13.5px] font-medium leading-[1.4]">{topic.label}</div>
                  <div className="text-[11.5px] text-[var(--muted-2)] font-mono mt-[4px] flex gap-[10px] items-center">
                    <span className="bg-[var(--surface-3)] text-[var(--muted)] px-[7px] py-[1px] rounded-[5px]">{topic.person_count} pessoas</span>
                    {topic.message_count} msgs · {topic.trend || 'estável'}
                  </div>
                </div>
                <span className="font-mono text-[12px] text-[var(--accent)] whitespace-nowrap pt-[2px] inline-flex items-center gap-[4px]"><Zap className="w-3 h-3" /> {topic.message_count}</span>
              </div>
            ))}
            {!groupTopics?.length && (
              <div className="py-8 text-center text-[var(--muted-2)] text-[13px]">Nenhum tópico de grupo ainda. Envie mensagens nos grupos e clique em Atualizar.</div>
            )}
          </div>
        </div>

        {/* Trending nos grupos */}
        <div className="bg-[var(--surface)] border border-[var(--border-soft)] rounded-[var(--radius)] p-[22px]">
          <div className="flex items-center justify-between mb-[16px]">
            <h3 className="text-[13px] font-semibold text-[var(--muted)] uppercase tracking-[0.02em] flex items-center gap-[7px]"><Flame className="w-3.5 h-3.5" /> Trending nos grupos</h3>
          </div>
          <div className="flex flex-col">
            {groupTopics?.slice(0, 5).map((item, i) => (
              <div key={i} onClick={() => setSelectedTopic(item)} className="flex items-center gap-[12px] py-[11px] border-b border-[var(--border-soft)] last:border-none cursor-pointer transition-[0.12s] hover:bg-[var(--surface-2)] -mx-[10px] px-[10px] rounded-[8px]">
                <span className="font-mono text-[12px] text-[var(--muted-2)] w-[16px]">{(i + 1).toString().padStart(2, '0')}</span>
                <span className="flex-1 font-medium text-[13.5px] text-[var(--text)] truncate">{item.label}</span>
                <span className="h-[6px] rounded-[6px] bg-gradient-to-r from-[var(--accent-dim)] to-[var(--accent)] shadow-[0_0_8px_var(--accent-glow)]" style={{ width: `${Math.max(20, Math.min(60, (item.message_count || 0)))}px` }}></span>
                <span className="font-mono text-[12px] font-medium w-[46px] text-right text-[var(--ok)]">{item.message_count || 0}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[1fr] gap-[16px]">
        {/* Grupos Ativos */}
        <div className="bg-[var(--surface)] border border-[var(--border-soft)] rounded-[var(--radius)] p-[22px]">
          <div className="flex items-center justify-between mb-[16px]">
            <h3 className="text-[13px] font-semibold text-[var(--muted)] uppercase tracking-[0.02em]">Grupos Ativos</h3>
            <span className="font-mono text-[var(--muted)] text-[12px]">{groups?.length || 0} grupos monitorados</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr>
                  <th className="text-[11px] uppercase tracking-[0.08em] text-[var(--muted-2)] font-semibold pb-[12px] border-b border-[var(--border-soft)] px-[14px]">Grupo</th>
                  <th className="text-[11px] uppercase tracking-[0.08em] text-[var(--muted-2)] font-semibold pb-[12px] border-b border-[var(--border-soft)] px-[14px]">Msgs (7d)</th>
                  <th className="text-[11px] uppercase tracking-[0.08em] text-[var(--muted-2)] font-semibold pb-[12px] border-b border-[var(--border-soft)] px-[14px]">Relevância</th>
                  <th className="text-[11px] uppercase tracking-[0.08em] text-[var(--muted-2)] font-semibold pb-[12px] border-b border-[var(--border-soft)] px-[14px] text-right">Suporte/ruído</th>
                </tr>
              </thead>
              <tbody>
                {groups?.map((group, i) => (
                  <tr 
                    key={i} 
                    className="cursor-pointer hover:bg-[var(--surface-2)] transition-[0.12s]"
                    onClick={() => setSelectedGroup(group.chat_id)}
                  >
                    <td className="py-[13px] px-[14px] border-b border-[var(--border-soft)] text-[13.5px] align-middle">
                      <div className="flex items-center gap-[11px] font-semibold">
                        <div className="w-[30px] h-[30px] rounded-[8px] bg-[var(--surface-3)] flex items-center justify-center shrink-0 text-[var(--muted)]"><Users className="w-4 h-4" /></div>
                        {group.name || "Grupo sem nome"}
                      </div>
                    </td>
                    <td className="py-[13px] px-[14px] border-b border-[var(--border-soft)] text-[13.5px] align-middle">
                      <span className="font-mono text-[var(--muted)]">{group.message_count}</span>
                    </td>
                    <td className="py-[13px] px-[14px] border-b border-[var(--border-soft)] text-[13.5px] align-middle">
                      {(() => {
                        const ratio = (group.message_count || 0) / maxGroupMsgs;
                        const filled = ratio >= 0.66 ? 3 : ratio >= 0.33 ? 2 : 1;
                        return (
                          <div className="inline-flex gap-[3px]">
                            {[0, 1, 2].map((d) => (
                              <i key={d} className={`w-[6px] h-[6px] rounded-full ${d < filled ? 'bg-[var(--accent)] shadow-[0_0_6px_var(--accent-glow)]' : 'bg-[var(--surface-3)]'}`}></i>
                            ))}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="py-[13px] px-[14px] border-b border-[var(--border-soft)] text-[13.5px] align-middle text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSupport.mutate({ chatId: group.chat_id, isSupport: !group.is_support });
                        }}
                        disabled={setSupport.isPending}
                        title={group.is_support ? "Marcado como suporte/ruído — oculto por padrão em Menções. Clique para reativar." : "Marcar como suporte/ruído (ocultar por padrão em Menções)"}
                        className={`inline-flex items-center gap-[6px] text-[11.5px] font-medium px-[10px] py-[5px] rounded-[7px] border transition-[0.14s] disabled:opacity-50 ${
                          group.is_support
                            ? 'border-[var(--accent-dim)] text-[var(--accent)] bg-[var(--accent-glow)]'
                            : 'border-[var(--border)] text-[var(--muted-2)] hover:text-[var(--text)] hover:border-[var(--border-strong,var(--accent-dim))]'
                        }`}
                      >
                        {group.is_support ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        {group.is_support ? "Suporte" : "Marcar"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Sheet open={!!selectedTopic} onOpenChange={(open) => !open && setSelectedTopic(null)}>
        <SheetContent className="w-[460px] max-w-[92vw] bg-[var(--surface)] border-l border-[var(--border)] p-0 flex flex-col sm:max-w-none">
          <SheetHeader className="p-[22px_22px_18px] border-b border-[var(--border-soft)] space-y-0">
            <SheetTitle className="font-display font-semibold text-[18px] leading-[1.3]">
              {selectedTopic?.label}
            </SheetTitle>
            <SheetDescription className="text-[13px] text-[var(--muted)] mt-1 flex items-center gap-[10px] flex-wrap font-mono">
              <span className="inline-flex items-center gap-[4px]"><Zap className="w-3 h-3 text-[var(--accent)]" /> em {selectedTopic?.group_count ?? 0} grupos</span>
              <span className="inline-flex items-center gap-[4px]"><Users className="w-3 h-3" /> {selectedTopic?.person_count ?? 0} pessoas</span>
              <span className="inline-flex items-center gap-[4px] text-[var(--ok)]"><TrendingUp className="w-3 h-3" /> {selectedTopic?.message_count ?? 0} msgs</span>
            </SheetDescription>
          </SheetHeader>

          <div className="p-[20px_22px] overflow-y-auto flex-1">
            {selectedTopic?.summary && (
              <div className="mb-[22px]">
                <h4 className="text-[11px] uppercase tracking-[0.08em] text-[var(--muted-2)] mb-[10px]">Resumo IA</h4>
                <p className="text-[13.5px] text-[var(--text)] leading-relaxed border-l-2 border-[var(--accent-dim)] pl-[12px]">
                  {selectedTopic.summary}
                </p>
              </div>
            )}

            {loadingTopic ? (
              <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-[var(--accent)]" /></div>
            ) : (
              <>
                {!!topicDetail?.groups?.length && (
                  <div className="mb-[22px]">
                    <h4 className="text-[11px] uppercase tracking-[0.08em] text-[var(--muted-2)] mb-[10px]">Grupos onde aparece</h4>
                    <div className="flex flex-col gap-[6px]">
                      {topicDetail.groups.map((g) => (
                        <button
                          key={g.chat_id}
                          onClick={() => openGroupFromTopic(g.chat_id)}
                          className="flex items-center justify-between gap-[10px] text-left bg-[var(--surface-2)] border border-[var(--border-soft)] rounded-[10px] p-[10px_13px] cursor-pointer transition-[0.12s] hover:border-[var(--accent-dim)] group"
                        >
                          <span className="flex items-center gap-[10px] min-w-0">
                            <span className="w-[28px] h-[28px] rounded-[8px] bg-[var(--surface-3)] flex items-center justify-center shrink-0 text-[var(--muted)]"><Users className="w-3.5 h-3.5" /></span>
                            <span className="text-[13px] font-medium truncate">{g.name || "Grupo sem nome"}</span>
                          </span>
                          <span className="flex items-center gap-[8px] shrink-0">
                            <span className="font-mono text-[11.5px] text-[var(--muted)]">{g.message_count ?? 0} msgs</span>
                            <ArrowUpRight className="w-3.5 h-3.5 text-[var(--muted-2)] group-hover:text-[var(--accent)]" />
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <h4 className="text-[11px] uppercase tracking-[0.08em] text-[var(--muted-2)] mb-[10px] flex items-center gap-[6px]"><Quote className="w-3 h-3" /> Trechos das conversas</h4>
                  <div className="space-y-[8px]">
                    {topicDetail?.excerpts?.map((ex) => (
                      <div key={ex.message_id} className="bg-[var(--surface-2)] border border-[var(--border-soft)] rounded-[10px] p-[11px_13px]">
                        <div className="flex items-center gap-[8px] text-[12px] font-semibold text-[var(--accent)]">
                          {ex.sender_name || "Desconhecido"}
                          {ex.chat_name && <span className="text-[10.5px] font-normal font-mono text-[var(--muted-2)] truncate">· {ex.chat_name}</span>}
                        </div>
                        <div className="text-[13px] mt-[3px] leading-[1.45] text-[var(--text)]">{ex.text}</div>
                        <div className="text-[10.5px] text-[var(--muted-2)] font-mono mt-[5px]">
                          {ex.message_created_at ? new Date(ex.message_created_at).toLocaleString() : ""}
                        </div>
                      </div>
                    ))}
                    {!topicDetail?.excerpts?.length && (
                      <div className="py-6 text-center text-[var(--muted-2)] text-[13px]">Nenhum trecho disponível.</div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={!!selectedGroup} onOpenChange={(open) => !open && setSelectedGroup(null)}>
        <SheetContent className="w-[440px] max-w-[92vw] bg-[var(--surface)] border-l border-[var(--border)] p-0 flex flex-col sm:max-w-none">
          <SheetHeader className="flex flex-row items-start gap-[12px] p-[22px_22px_18px] border-b border-[var(--border-soft)] space-y-0">
            <div className="flex-1">
              <SheetTitle className="font-display font-semibold text-[18px] leading-[1.25]">
                Detalhes do Grupo
              </SheetTitle>
              <SheetDescription className="text-[13px] text-[var(--muted)] mt-1">
                Resumo e trechos extraídos por IA
              </SheetDescription>
            </div>
          </SheetHeader>
          
          <div className="p-[20px_22px] overflow-y-auto flex-1">
            {loadingDigest ? (
               <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-[var(--accent)]" /></div>
            ) : (
              <>
                {digest?.digest && (
                  <div className="mb-[22px]">
                    <h4 className="text-[11px] uppercase tracking-[0.08em] text-[var(--muted-2)] mb-[10px]">Resumo IA</h4>
                    <p className="text-[13.5px] text-[var(--text)] leading-relaxed">
                      {(digest.digest as any).summary || "Resumo não disponível."}
                    </p>
                  </div>
                )}
                <div>
                   <h4 className="text-[11px] uppercase tracking-[0.08em] text-[var(--muted-2)] mb-[10px]">Discussões Recentes</h4>
                   <div className="space-y-[8px]">
                     {digest?.recentExcerpts?.map((ex, i) => (
                       <div key={i} className="bg-[var(--surface-2)] border border-[var(--border-soft)] rounded-[10px] p-[11px_13px]">
                         <div className="text-[12px] font-semibold text-[var(--accent)]">{ex.sender_name || "Desconhecido"}</div>
                         <div className="text-[13px] mt-[3px] leading-[1.45] text-[var(--text)]">{ex.text}</div>
                         <div className="text-[10.5px] text-[var(--muted-2)] font-mono mt-[5px]">
                           {ex.message_created_at ? new Date(ex.message_created_at).toLocaleString() : ""}
                         </div>
                       </div>
                     ))}
                   </div>
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
