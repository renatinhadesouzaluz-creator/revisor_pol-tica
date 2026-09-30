// Temas do resultado: cada um é um item de menu com tela própria,
// tanto na ferramenta quanto no relatório HTML exportado.
// tipos: tipos de apontamento exibidos (undefined = tela sem lista filtrável).

export const THEMES = [
  {
    id: 'resumo',
    label: 'Resumo Executivo',
    intro: 'Visão gerencial da revisão: principais pontos, totais e validação da estrutura mínima da política.',
  },
  {
    id: 'politica',
    label: 'Política Revisada',
    intro: 'Versão integral da política com as alterações destacadas. Numeração, títulos e ordem das seções são preservados.',
  },
  {
    id: 'depara',
    label: 'DE/PARA',
    tipos: ['alteracao'],
    intro: 'Trilha formal das alterações sugeridas, com texto atual, sugestão, justificativa e classificação.',
  },
  {
    id: 'duplicidades',
    label: 'Duplicidades',
    tipos: ['duplicidade'],
    intro: 'Regras, conceitos ou informações repetidas em pontos diferentes da política.',
  },
  {
    id: 'conceitos',
    label: 'Conceitos',
    tipos: ['conceito'],
    intro: 'Análise cruzada entre o item Conceitos e o restante da política.',
  },
  {
    id: 'responsabilidades',
    label: 'Papéis e Responsabilidades',
    tipos: ['responsabilidade'],
    intro: 'Análise cruzada entre as áreas e atividades citadas na política e o item Papéis e Responsabilidades.',
  },
  {
    id: 'ambiguidades',
    label: 'Ambiguidades',
    tipos: ['ambiguidade'],
    intro: 'Expressões que permitem mais de uma interpretação por falta de critério objetivo no documento.',
  },
  {
    id: 'riscos',
    label: 'Riscos de Interpretação',
    tipos: ['risco'],
    intro: 'Trechos com risco de interpretação ou de aplicação inadequada, contradições e regras não executáveis.',
  },
  {
    id: 'questionamentos',
    label: 'Questionamentos para a Área',
    tipos: ['questionamento'],
    intro: 'Pontos que dependem de decisão da área responsável. A ferramenta não presume respostas.',
  },
  {
    id: 'governanca',
    label: 'Governança e Controles Internos',
    tipos: ['governanca'],
    intro: 'Pontos de atenção e questionamentos sobre segregação de funções, aprovações, evidências, monitoramento e exceções.',
  },
  {
    id: 'todos',
    label: 'Todos os Apontamentos',
    tipos: null,
    intro: 'Lista consolidada de todos os apontamentos, com filtro por tipo.',
  },
];
