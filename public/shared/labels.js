// Enumerações e rótulos compartilhados entre navegador e servidor.
// Alterar aqui reflete no schema da IA, na interface e nos relatórios.

export const CATEGORIAS = [
  'Clareza',
  'Ambiguidade',
  'Duplicidade',
  'Consistência',
  'Conceito',
  'Responsabilidade',
  'Tempo verbal',
  'Padronização',
  'Risco de interpretação',
  'Governança',
  'Controle Interno',
  'Formatação',
];

export const TIPOS_AJUSTE = {
  editorial: 'Ajuste editorial',
  requer_validacao: 'Requer validação da área',
};

export const TIPOS_RESPONSABILIDADE = {
  area_ausente_item5: 'Área mencionada no documento, mas ausente em Papéis e Responsabilidades',
  responsabilidade_ausente_item5: 'Responsabilidade descrita no documento, mas ausente no item Papéis e Responsabilidades',
  area_sem_responsabilidade_clara: 'Área presente em Papéis e Responsabilidades sem responsabilidade clara',
  responsabilidade_duplicada: 'Responsabilidade duplicada',
  responsabilidade_conflitante: 'Responsabilidade conflitante',
  atividade_sem_responsavel: 'Atividade sem responsável definido',
  responsabilidade_generica: 'Responsabilidade excessivamente genérica',
};

export const TIPOS_CONCEITO_FALTANTE = {
  sigla: 'Sigla',
  sistema: 'Sistema',
  documento: 'Documento',
  termo_tecnico: 'Termo técnico',
  nomenclatura: 'Nomenclatura',
};

export const TEMAS_GOVERNANCA = {
  segregacao_funcoes: 'Segregação de funções',
  responsaveis: 'Responsáveis',
  aprovacoes: 'Aprovações',
  evidencias: 'Evidências',
  monitoramento: 'Monitoramento',
  tratamento_excecoes: 'Tratamento de exceções',
  criterios_decisao: 'Critérios de decisão',
  rastreabilidade: 'Rastreabilidade',
  formalizacao: 'Formalização',
  responsabilidades_conflitantes: 'Responsabilidades conflitantes',
  ausencia_responsavel: 'Ausência de responsável',
  ausencia_controle: 'Ausência de controle',
  ausencia_evidencia_execucao: 'Ausência de evidência da execução',
};

export const TIPOS_GOVERNANCA = {
  ponto_atencao: 'Ponto de atenção de Governança/Controle Interno',
  questionamento: 'Questionamento para validação da área',
};

export const SECOES_OBRIGATORIAS = {
  objetivo: 'Objetivo',
  abrangencia: 'Abrangência',
  conceitos: 'Conceitos',
  regras: 'Regras/Procedimentos',
  papeis: 'Papéis e Responsabilidades',
};

export const RESPOSTA_PERGUNTA = {
  sim: 'Sim',
  parcial: 'Parcialmente',
  nao: 'Não',
};

export const PERGUNTAS_ESSENCIAIS = [
  'Por que a política existe?',
  'A quem se aplica?',
  'Quais conceitos são necessários?',
  'Quais são as principais regras?',
  'Quem é responsável por cada atividade relevante?',
];

// Tipos de apontamento usados na visão consolidada e nos filtros.
export const TIPOS_APONTAMENTO = {
  alteracao: 'Alteração (DE/PARA)',
  duplicidade: 'Duplicidade',
  conceito: 'Conceito',
  responsabilidade: 'Responsabilidade',
  ambiguidade: 'Ambiguidade',
  risco: 'Risco de interpretação',
  questionamento: 'Questionamento',
  governanca: 'Governança/Controle Interno',
};

export const TEXTO_NAO_IDENTIFICADO =
  'Informação não identificada no documento – requer validação da área.';
