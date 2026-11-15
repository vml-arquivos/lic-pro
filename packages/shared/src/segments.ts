/**
 * Segmentos e produtos/serviços para a busca guiada.
 *
 * Hierarquia: nicho → segmento → produto ou serviço. É vocabulário de navegação (palavras que
 * costumam aparecer no objeto dos editais), não uma classificação oficial nem uma decisão de
 * habilitação. Cada produto/serviço é escrito como "Nome|sinônimo|sinônimo": o nome aparece na
 * lista e todos os termos entram na busca.
 */

export type SegmentItem = {
  /** Nome mostrado na lista (e usado como valor do filtro `item`). */
  label: string;
  terms: readonly string[];
};

export type SegmentDefinition = {
  /** `nicho/segmento`, estável para salvar no perfil e nas buscas. */
  code: string;
  niche: string;
  label: string;
  items: readonly SegmentItem[];
  /** Todos os termos do segmento (união dos itens). */
  terms: readonly string[];
};

type RawSegment = readonly [label: string, items: readonly string[]];

const slug = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const RAW: Readonly<Record<string, readonly RawSegment[]>> = {
  'agropecuaria-alimentos': [
    [
      'Gêneros alimentícios e merenda',
      [
        'Merenda escolar|alimentação escolar|merenda',
        'Hortifrúti|frutas|verduras|legumes',
        'Carnes e pescados|carne bovina|frango|peixe',
        'Laticínios e ovos|leite|queijo|ovos',
        'Panificação|pão|biscoito|bolo',
        'Cesta básica|gêneros alimentícios|cesta de alimentos',
        'Agricultura familiar|PNAE|agricultura familiar',
      ],
    ],
    [
      'Insumos agrícolas',
      [
        'Sementes e mudas|semente|muda',
        'Adubos e fertilizantes|adubo|fertilizante|calcário',
        'Defensivos agrícolas|defensivo|herbicida|inseticida',
        'Ração e nutrição animal|ração|sal mineral',
      ],
    ],
    [
      'Máquinas e implementos agrícolas',
      [
        'Tratores|trator',
        'Implementos agrícolas|arado|grade|plantadeira|carreta agrícola',
        'Irrigação|irrigação|bomba de irrigação',
        'Patrulha mecanizada|patrulha agrícola|retroescavadeira',
      ],
    ],
    [
      'Pecuária e veterinária',
      [
        'Medicamentos veterinários|medicamento veterinário|vacina animal',
        'Inseminação e genética|inseminação|sêmen',
        'Cercas e currais|arame farpado|cerca|curral',
      ],
    ],
  ],
  'mineracao-recursos-naturais': [
    [
      'Agregados e materiais pétreos',
      [
        'Brita|brita|pedra britada',
        'Areia|areia lavada|areia média',
        'Cascalho e saibro|cascalho|saibro|piçarra',
        'Pedras e rochas|pedra|rocha|paralelepípedo',
      ],
    ],
    [
      'Extração e beneficiamento',
      [
        'Serviços de extração|extração mineral|lavra',
        'Beneficiamento mineral|beneficiamento',
        'Calcário agrícola|calcário|corretivo de solo',
      ],
    ],
    [
      'Geologia e sondagem',
      [
        'Sondagem|sondagem|perfuração de solo',
        'Levantamento geológico|geologia|estudo geológico',
        'Poços artesianos|poço artesiano|poço tubular',
      ],
    ],
  ],
  'industria-manufatura': [
    [
      'Fabricação e usinagem',
      [
        'Usinagem|usinagem|torno|fresa',
        'Soldagem e caldeiraria|solda|caldeiraria|serralheria',
        'Fundição|fundição|fundido',
        'Peças sob medida|fabricação de peças|peça sob encomenda',
      ],
    ],
    [
      'Matérias-primas e componentes',
      [
        'Aço e metais|aço|chapa de aço|perfil metálico',
        'Plásticos e borracha|plástico|borracha|polímero',
        'Rolamentos e correias|rolamento|correia',
        'Parafusos e fixadores|parafuso|porca|arruela',
      ],
    ],
    [
      'Máquinas e equipamentos industriais',
      [
        'Compressores|compressor|compressor de ar',
        'Bombas|bomba hidráulica|motobomba',
        'Motores elétricos|motor elétrico|redutor',
        'Ferramentas industriais|ferramenta|máquina operatriz',
      ],
    ],
    [
      'Embalagens',
      [
        'Caixas e papelão|caixa de papelão|embalagem',
        'Sacos e sacolas|saco plástico|sacola',
        'Pallets|pallet|palete',
      ],
    ],
  ],
  'energia-utilidades': [
    [
      'Iluminação pública',
      [
        'Luminárias LED|luminária led|luminária',
        'Postes e braços|poste|braço de iluminação',
        'Manutenção da iluminação pública|iluminação pública|ponto de luz',
        'Reatores e lâmpadas|lâmpada|reator|relé fotoelétrico',
      ],
    ],
    [
      'Material elétrico',
      [
        'Cabos e fios|cabo elétrico|fio elétrico|condutor',
        'Disjuntores e quadros|disjuntor|quadro de distribuição',
        'Transformadores|transformador',
        'Tomadas e interruptores|tomada|interruptor',
      ],
    ],
    [
      'Energia solar',
      [
        'Usina fotovoltaica|usina solar|fotovoltaica',
        'Painéis solares|painel solar|módulo fotovoltaico|inversor solar',
        'Aquecimento solar|aquecedor solar',
      ],
    ],
    [
      'Geradores e combustíveis',
      [
        'Geradores|gerador|grupo gerador',
        'Nobreaks e baterias|nobreak|bateria estacionária',
        'Gás GLP|gás GLP|botijão|gás de cozinha',
        'Combustíveis|combustível|gasolina|diesel|etanol',
      ],
    ],
  ],
  'agua-saneamento-residuos': [
    [
      'Água e esgoto',
      [
        'Tubos e conexões|tubo|conexão|PVC|manilha',
        'Hidrômetros|hidrômetro',
        'Redes de água e esgoto|rede de esgoto|rede de água|adutora',
        'Estações de tratamento|estação de tratamento|ETA|ETE',
        'Produtos químicos para tratamento|cloro|sulfato de alumínio|hipoclorito',
      ],
    ],
    [
      'Resíduos sólidos',
      [
        'Coleta de lixo|coleta de lixo|coleta de resíduos',
        'Aterro sanitário|aterro|destinação final',
        'Resíduos de saúde|resíduos de serviços de saúde|RSS|lixo hospitalar',
        'Coleta seletiva|coleta seletiva|reciclagem',
        'Caçambas e contêineres|caçamba|contêiner de lixo',
      ],
    ],
    [
      'Drenagem e limpeza urbana',
      [
        'Drenagem|drenagem|galeria pluvial|bueiro',
        'Varrição|varrição|limpeza de vias',
        'Limpeza de fossas|limpa fossa|caminhão limpa-fossa',
      ],
    ],
  ],
  'construcao-obras': [
    [
      'Obras e reformas',
      [
        'Construção de escola|construção de escola|escola',
        'Construção de unidade de saúde|unidade básica de saúde|UBS|posto de saúde',
        'Reforma de prédio público|reforma|ampliação',
        'Quadras e praças|quadra poliesportiva|praça|campo de futebol',
        'Obras de edificação|edificação|construção civil',
      ],
    ],
    [
      'Pavimentação e infraestrutura',
      [
        'Pavimentação asfáltica|pavimentação|asfalto|CBUQ',
        'Calçamento|calçamento|paver|bloquete',
        'Tapa-buracos e recapeamento|tapa-buraco|recapeamento|microrrevestimento',
        'Pontes e bueiros|ponte|bueiro|galeria',
        'Terraplenagem|terraplenagem|escavação|aterro',
      ],
    ],
    [
      'Materiais de construção',
      [
        'Cimento e argamassa|cimento|argamassa|concreto',
        'Tijolos e blocos|tijolo|bloco de concreto|bloco cerâmico',
        'Ferragens e aço|vergalhão|ferragem|tela soldada',
        'Madeira e telhas|madeira|telha|cobertura',
        'Tintas e revestimentos|tinta|piso|revestimento cerâmico',
      ],
    ],
    [
      'Projetos e fiscalização de obras',
      [
        'Projeto de engenharia|projeto executivo|projeto básico|projeto de engenharia',
        'Fiscalização de obras|fiscalização de obra|supervisão de obra',
        'Topografia|topografia|levantamento topográfico',
      ],
    ],
    [
      'Locação de máquinas pesadas',
      [
        'Locação de máquinas|locação de máquina|locação de equipamento pesado',
        'Escavadeira e retroescavadeira|escavadeira|retroescavadeira|pá carregadeira',
        'Caminhão basculante|caminhão basculante|caminhão caçamba',
        'Motoniveladora e rolo compactador|motoniveladora|rolo compactador',
      ],
    ],
  ],
  'comercio-bens': [
    [
      'Fornecimento geral e registro de preços',
      [
        'Registro de preços|registro de preços|ata de registro de preços',
        'Aquisição de materiais|aquisição de materiais|material permanente',
        'Equipamentos diversos|aquisição de equipamentos|equipamento',
      ],
    ],
    [
      'Eletrodomésticos e utensílios',
      [
        'Eletrodomésticos|eletrodoméstico|geladeira|fogão|micro-ondas',
        'Ar-condicionado|ar condicionado|climatizador',
        'Utensílios de cozinha|utensílio|panela|talher',
        'Bebedouros e ventiladores|bebedouro|ventilador',
      ],
    ],
    [
      'Ferramentas e utilidades',
      [
        'Ferramentas manuais|ferramenta manual|furadeira|serra',
        'Material de jardinagem|roçadeira|jardinagem|cortador de grama',
        'Brinquedos e playground|brinquedo|playground|parquinho',
      ],
    ],
  ],
  'transporte-logistica': [
    [
      'Transporte escolar e de pessoas',
      [
        'Transporte escolar|transporte escolar',
        'Transporte de passageiros|transporte de passageiros|fretamento|ônibus',
        'Transporte de pacientes|transporte de pacientes|TFD|ambulância',
        'Locação de veículos com motorista|locação de veículo|locação de veículos',
      ],
    ],
    [
      'Cargas e entregas',
      [
        'Frete e transporte de cargas|frete|transporte de carga',
        'Mudanças e carretos|mudança|carreto',
        'Serviços postais e entregas|correspondência|serviço postal|entrega expressa|courier',
        'Armazenagem|armazenagem|armazém|depósito',
      ],
    ],
    [
      'Combustível e abastecimento de frota',
      [
        'Gestão de abastecimento|gerenciamento de abastecimento|cartão de abastecimento',
        'Combustíveis para frota|combustível|diesel|gasolina',
        'Lubrificantes e fluidos|óleo lubrificante|lubrificante|arla',
      ],
    ],
    [
      'Passagens e viagens',
      [
        'Passagens aéreas|passagem aérea|passagens aéreas',
        'Agenciamento de viagens|agência de viagens|agenciamento de viagens',
      ],
    ],
  ],
  'hospedagem-alimentacao': [
    [
      'Refeições e alimentação preparada',
      [
        'Refeições prontas|refeição|marmitex|quentinha',
        'Cozinha industrial|cozinha industrial|preparo de refeições',
        'Fornecimento de lanches|lanche|coffee break',
        'Cantina e restaurante|restaurante|cantina',
      ],
    ],
    [
      'Hospedagem',
      [
        'Hospedagem|hospedagem|hotel|pousada',
        'Diárias de hotel|diária de hotel|diárias',
        'Alojamento|alojamento|abrigo',
      ],
    ],
    [
      'Buffet e eventos gastronômicos',
      [
        'Buffet|buffet|serviço de buffet',
        'Catering|catering|banquete',
        'Água e bebidas|água mineral|garrafão|bebida',
      ],
    ],
  ],
  'tecnologia-comunicacao': [
    [
      'Software e sistemas',
      [
        'Sistema de gestão pública|sistema de gestão|sistema integrado|ERP',
        'Licenças de software|licença de software|licenciamento',
        'Desenvolvimento de software|desenvolvimento de software|desenvolvimento de sistema',
        'Sistema de atendimento e protocolo|protocolo eletrônico|gestão documental|atendimento ao cidadão',
        'Antivírus e segurança|antivírus|firewall|segurança da informação',
        'Nuvem e hospedagem|computação em nuvem|nuvem|hospedagem de sites',
      ],
    ],
    [
      'Equipamentos de informática',
      [
        'Computadores e notebooks|computador|notebook|microcomputador',
        'Impressoras e suprimentos|impressora|toner|cartucho',
        'Monitores e periféricos|monitor|teclado|mouse|webcam',
        'Servidores e storage|servidor|storage|datacenter',
        'Tablets e chromebooks|tablet|chromebook',
        'Projetores e lousas digitais|projetor|lousa digital|tela interativa',
      ],
    ],
    [
      'Redes e telecomunicações',
      [
        'Cabeamento estruturado|cabeamento estruturado|rede lógica|cabo de rede',
        'Wi-Fi e roteadores|wi-fi|wifi|roteador|access point|switch',
        'Link de internet|link de internet|internet dedicada|banda larga',
        'Telefonia e PABX|telefonia|PABX|telefone IP|central telefônica',
        'Telefonia móvel|telefonia móvel|chip|plano de dados',
        'Rádio e comunicação|rádio comunicador|rádio|antena|torre de comunicação',
      ],
    ],
    [
      'Suporte e outsourcing de TI',
      [
        'Suporte técnico de TI|suporte técnico|help desk|service desk',
        'Outsourcing de impressão|outsourcing de impressão|impressão corporativa',
        'Manutenção de computadores|manutenção de computadores|manutenção de equipamentos de informática',
        'Locação de equipamentos de TI|locação de computadores|locação de equipamentos de informática',
      ],
    ],
    [
      'Videomonitoramento e automação',
      [
        'Câmeras e CFTV|câmera|CFTV|videomonitoramento',
        'Controle de acesso e ponto|controle de acesso|catraca|relógio de ponto|ponto eletrônico',
        'Alarmes|alarme|sensor de presença|central de alarme',
      ],
    ],
    [
      'Comunicação e publicidade',
      [
        'Publicidade institucional|publicidade|propaganda|campanha publicitária',
        'Gráfica e impressos|serviço gráfico|impressão gráfica|material impresso|banner',
        'Mídia e rádio|veiculação|mídia|spots de rádio',
        'Fotografia e vídeo|filmagem|fotografia|produção audiovisual',
      ],
    ],
  ],
  'financas-seguros': [
    [
      'Seguros',
      [
        'Seguro de veículos|seguro de veículos|seguro automotivo',
        'Seguro predial|seguro patrimonial|seguro predial',
        'Seguro de vida|seguro de vida|seguro de acidentes',
      ],
    ],
    [
      'Serviços financeiros',
      [
        'Folha de pagamento bancária|folha de pagamento|serviços bancários',
        'Consignado e crédito|consignado|crédito consignado',
        'Cobrança e arrecadação|arrecadação|cobrança|dívida ativa',
      ],
    ],
    [
      'Contabilidade e auditoria',
      [
        'Contabilidade|assessoria contábil|serviços contábeis|contabilidade',
        'Auditoria|auditoria|auditoria independente',
        'Assessoria financeira|assessoria financeira|consultoria financeira',
      ],
    ],
  ],
  imobiliario: [
    [
      'Locação de imóveis',
      [
        'Locação de imóvel para órgão público|locação de imóvel|aluguel de imóvel',
        'Locação de sala comercial|sala comercial|imóvel comercial',
        'Locação de galpão|galpão|armazém',
      ],
    ],
    [
      'Administração e avaliação',
      [
        'Avaliação de imóveis|avaliação de imóveis|laudo de avaliação',
        'Administração predial|administração predial|condomínio',
        'Regularização fundiária|regularização fundiária|georreferenciamento|cadastro imobiliário',
      ],
    ],
  ],
  'servicos-profissionais': [
    [
      'Consultoria e assessoria',
      [
        'Consultoria técnica|consultoria|assessoria técnica',
        'Assessoria jurídica|assessoria jurídica|consultoria jurídica|serviços advocatícios',
        'Assessoria em licitações|assessoria em licitações|apoio à contratação',
        'Elaboração de planos e estudos|plano diretor|estudo de viabilidade|plano municipal',
      ],
    ],
    [
      'Engenharia e arquitetura',
      [
        'Projetos de arquitetura|projeto arquitetônico|arquitetura',
        'Laudos e perícias|laudo técnico|perícia|vistoria',
        'Topografia e georreferenciamento|topografia|georreferenciamento',
        'Engenharia elétrica e SPDA|SPDA|projeto elétrico|laudo elétrico',
      ],
    ],
    [
      'Treinamento e RH',
      [
        'Concurso público|concurso público|banca organizadora|processo seletivo',
        'Recrutamento e seleção|recrutamento|seleção de pessoal',
        'Medicina e segurança do trabalho|PCMSO|PPRA|medicina do trabalho|segurança do trabalho',
      ],
    ],
    [
      'Pesquisa e estudos',
      [
        'Pesquisa de opinião|pesquisa de opinião|pesquisa de satisfação',
        'Tradução|tradução|interpretação|libras',
      ],
    ],
  ],
  'servicos-administrativos': [
    [
      'Terceirização de mão de obra',
      [
        'Mão de obra terceirizada|mão de obra|terceirização de mão de obra|posto de trabalho',
        'Recepção e portaria|recepcionista|portaria|porteiro',
        'Apoio administrativo|apoio administrativo|auxiliar administrativo|agente administrativo',
        'Motoristas e operadores|motorista|operador de máquinas',
        'Copeiragem e jardinagem|copeira|copeiragem|jardineiro',
      ],
    ],
    [
      'Gestão documental',
      [
        'Digitalização|digitalização|microfilmagem|gestão de documentos',
        'Arquivo e guarda de documentos|guarda de documentos|arquivo|arquivamento',
        'Call center|call center|central de atendimento|teleatendimento',
      ],
    ],
    [
      'Reprografia e impressão',
      [
        'Cópias e impressões|reprografia|cópias|fotocópia',
        'Papel e resmas|papel A4|resma|papel sulfite',
        'Carimbos e chaves|carimbo|chaveiro|confecção de chaves',
      ],
    ],
  ],
  'educacao-treinamento': [
    [
      'Material escolar e didático',
      [
        'Material didático|material didático|livro didático|apostila',
        'Material escolar|material escolar|kit escolar|caderno',
        'Livros e acervo|livro|acervo bibliográfico|biblioteca',
        'Jogos pedagógicos|jogo pedagógico|brinquedo pedagógico|material pedagógico',
      ],
    ],
    [
      'Cursos e capacitações',
      [
        'Cursos e treinamentos|curso de capacitação|treinamento|capacitação',
        'Cursos de idiomas|curso de idiomas|ensino de idiomas',
        'Plataforma de ensino a distância|educação a distância|EAD|plataforma de ensino',
        'Palestras e oficinas|palestra|oficina|workshop',
      ],
    ],
    [
      'Estrutura escolar',
      [
        'Mobiliário escolar|mobiliário escolar|carteira escolar|cadeira escolar',
        'Transporte escolar|transporte escolar|ônibus escolar',
        'Uniforme escolar|uniforme escolar|farda escolar',
        'Equipamentos para laboratórios|laboratório de ciências|laboratório de informática',
      ],
    ],
  ],
  'saude-assistencia': [
    [
      'Serviços médicos e hospitalares',
      [
        'Plantões médicos|plantão médico|médico plantonista|serviços médicos',
        'Consultas e exames|exames laboratoriais|consulta especializada|exame de imagem',
        'Gestão de unidade de saúde|gestão de unidade de saúde|organização social de saúde',
        'Serviços de enfermagem|enfermagem|técnico de enfermagem',
        'Ambulâncias e UTI móvel|ambulância|UTI móvel|SAMU',
      ],
    ],
    [
      'Odontologia',
      [
        'Material odontológico|material odontológico|resina|anestésico odontológico',
        'Equipamentos odontológicos|cadeira odontológica|equipamento odontológico|raio-x odontológico',
        'Prótese dentária|prótese dentária|laboratório de prótese',
      ],
    ],
    [
      'Assistência social',
      [
        'Cestas e kits de assistência|kit assistência|cesta básica|benefício eventual',
        'Serviços de acolhimento|acolhimento|abrigo|instituição de longa permanência',
        'Serviços funerários|serviço funerário|urna funerária|funeral',
        'Cuidadores e apoio|cuidador|acompanhante|auxiliar de saúde',
      ],
    ],
    [
      'Vigilância e saúde pública',
      [
        'Controle de zoonoses|controle de zoonoses|dedetização|controle de vetores',
        'Vacinas e imunização|vacina|imunobiológico|câmara fria',
        'Campanhas de saúde|campanha de saúde|educação em saúde',
      ],
    ],
  ],
  'cultura-esporte-eventos': [
    [
      'Shows e eventos',
      [
        'Shows artísticos|show|contratação de artista|inexigibilidade artista',
        'Festas e festivais|festa|festival|carnaval|festejos',
        'Locação de palco e som|palco|sonorização|iluminação cênica|trio elétrico',
        'Estrutura para eventos|tenda|tendas|cadeiras e mesas|banheiro químico',
        'Fogos de artifício|fogos de artifício|pirotecnia',
      ],
    ],
    [
      'Esporte e lazer',
      [
        'Material esportivo|material esportivo|bola|uniforme esportivo|rede de vôlei',
        'Equipamentos de academia|academia ao ar livre|equipamento de ginástica|aparelho de musculação',
        'Gramado e quadras|grama sintética|piso esportivo|quadra de areia',
        'Premiações e troféus|troféu|medalha|premiação',
      ],
    ],
    [
      'Cultura',
      [
        'Instrumentos musicais|instrumento musical|banda marcial|fanfarra',
        'Oficinas culturais|oficina cultural|aulas de música|aulas de dança',
        'Teatro e cinema|teatro|cinema|exibição|apresentação teatral',
        'Livros e acervo cultural|acervo|museu|patrimônio cultural',
      ],
    ],
  ],
  'limpeza-conservacao': [
    [
      'Serviços de limpeza e conservação',
      [
        'Limpeza e conservação predial|limpeza e conservação|serviços de limpeza|servente',
        'Limpeza hospitalar|limpeza hospitalar|higienização hospitalar',
        'Limpeza de vidros e fachadas|limpeza de vidros|fachada|limpeza em altura',
        'Jardinagem e roçagem|jardinagem|roçagem|capina|poda',
        'Dedetização e controle de pragas|dedetização|desinsetização|controle de pragas|desratização',
      ],
    ],
    [
      'Produtos de limpeza',
      [
        'Material de limpeza|material de limpeza|produtos de limpeza|detergente|desinfetante',
        'Papel higiênico e toalhas|papel higiênico|papel toalha|toalha de papel',
        'Sacos de lixo|saco de lixo|saco para lixo',
        'Álcool e higienização|álcool em gel|álcool 70|sabonete líquido',
        'Equipamentos de limpeza|vassoura|rodo|aspirador|lavadora de alta pressão',
        'Descartáveis|copo descartável|descartáveis|copos plásticos',
      ],
    ],
    [
      'Higienização especializada',
      [
        "Limpeza de caixa d'água|caixa d'água|reservatório|limpeza de reservatório",
        'Limpeza de ar-condicionado|limpeza de ar-condicionado|higienização de ar condicionado',
        'Lavanderia|lavanderia|lavagem de roupas|enxoval',
      ],
    ],
  ],
  'seguranca-vigilancia': [
    [
      'Vigilância',
      [
        'Vigilância armada|vigilância armada|vigilante armado',
        'Vigilância desarmada|vigilância desarmada|vigilância patrimonial|vigia',
        'Monitoramento eletrônico|monitoramento eletrônico|central de monitoramento',
        'Brigada de incêndio|brigada de incêndio|bombeiro civil',
      ],
    ],
    [
      'Equipamentos de segurança',
      [
        'Câmeras e CFTV|câmera|CFTV|videomonitoramento',
        'Alarmes e cercas elétricas|alarme|cerca elétrica|concertina',
        'Extintores e prevenção de incêndio|extintor|hidrante|sprinkler|prevenção de incêndio',
        'Controle de acesso|controle de acesso|catraca|biometria',
        'Segurança patrimonial eletrônica|segurança eletrônica|monitoramento remoto',
      ],
    ],
    [
      'Segurança pública',
      [
        'Fardamento e equipamentos policiais|colete balístico|equipamento policial|algemas',
        'Viaturas e motocicletas|viatura|motocicleta|veículo caracterizado',
        'Videomonitoramento urbano|videomonitoramento urbano|câmeras de segurança|leitura de placas',
      ],
    ],
  ],
  'manutencao-predial': [
    [
      'Manutenção predial geral',
      [
        'Manutenção predial|manutenção predial|manutenção preventiva|manutenção corretiva',
        'Pintura|pintura|pintura predial|textura',
        'Serviços elétricos|serviços elétricos|manutenção elétrica|instalação elétrica',
        'Serviços hidráulicos|serviços hidráulicos|manutenção hidráulica|encanador',
        'Serralheria e marcenaria|serralheria|marcenaria|esquadria',
        'Impermeabilização e telhados|impermeabilização|telhado|calhas',
      ],
    ],
    [
      'Climatização e elevadores',
      [
        'Manutenção de ar-condicionado|manutenção de ar condicionado|PMOC|refrigeração',
        'Manutenção de elevadores|elevador|manutenção de elevadores|plataforma elevatória',
        'Aquisição de ar-condicionado|aquisição de ar condicionado|split',
        'Geradores e subestações|manutenção de gerador|subestação',
      ],
    ],
    [
      'Pequenas reformas e adequações',
      [
        'Adequação de acessibilidade|acessibilidade|rampa de acesso|piso tátil',
        'Forros e divisórias|forro|divisória|drywall|gesso',
        'Pisos e revestimentos|piso|revestimento|porcelanato',
        'Portões e grades|portão|grade|alambrado',
      ],
    ],
  ],
  'medicamentos-equipamentos-saude': [
    [
      'Medicamentos',
      [
        'Medicamentos em geral|medicamento|medicamentos|fármaco',
        'Medicamentos de alto custo|alto custo|medicamento especial|oncológico',
        'Insulinas e injetáveis|insulina|injetável|ampola',
        'Fitoterápicos e genéricos|fitoterápico|genérico',
        'Soros e soluções|soro|solução fisiológica|solução injetável',
      ],
    ],
    [
      'Materiais médico-hospitalares',
      [
        'Material médico-hospitalar|material médico hospitalar|material hospitalar',
        'Seringas, agulhas e cateteres|seringa|agulha|cateter|sonda',
        'Luvas e máscaras|luva|máscara|luva de procedimento',
        'Curativos e gazes|curativo|gaze|atadura|esparadrapo',
        'Testes rápidos e reagentes|teste rápido|reagente|kit diagnóstico',
        'Oxigênio e gases medicinais|oxigênio|gases medicinais|cilindro de oxigênio',
      ],
    ],
    [
      'Equipamentos hospitalares',
      [
        'Camas e macas|cama hospitalar|maca|cadeira de rodas',
        'Monitores e ventiladores|monitor multiparâmetros|ventilador pulmonar|desfibrilador',
        'Equipamentos de imagem|ultrassom|raio-x|tomógrafo|ressonância',
        'Esterilização|autoclave|esterilizador|esterilização',
        'Equipamentos laboratoriais|centrífuga|microscópio|analisador|equipamento laboratorial',
        'Mobiliário hospitalar|mobiliário hospitalar|armário hospitalar|carro de emergência',
      ],
    ],
    [
      'Órteses, próteses e ortopedia',
      [
        'Órteses e próteses|órtese|prótese|OPME',
        'Cadeiras de rodas e andadores|cadeira de rodas|andador|muleta',
        'Aparelhos auditivos|aparelho auditivo|prótese auditiva',
        'Óculos e lentes|óculos|lente|armação',
      ],
    ],
    [
      'Nutrição e dietas especiais',
      [
        'Fórmulas e dietas|fórmula infantil|dieta enteral|suplemento nutricional',
        'Fraldas e incontinência|fralda|absorvente|incontinência',
      ],
    ],
  ],
  'expediente-mobiliario': [
    [
      'Material de expediente',
      [
        'Papelaria em geral|material de expediente|papelaria|caneta|lápis',
        'Papel e resmas|papel A4|resma|papel sulfite',
        'Pastas e arquivos|pasta|arquivo|envelope|etiqueta',
        'Cartuchos e toners|toner|cartucho|tinta para impressora',
        'Material de escritório|grampeador|clipe|fita adesiva|cola',
      ],
    ],
    [
      'Mobiliário de escritório',
      [
        'Mesas e cadeiras|mesa|cadeira|cadeira giratória|mesa de escritório',
        'Armários e arquivos|armário|arquivo de aço|estante|gaveteiro',
        'Estações de trabalho|estação de trabalho|baia|divisória',
        'Longarinas e auditório|longarina|poltrona|cadeira de auditório',
      ],
    ],
    [
      'Mobiliário especial',
      [
        'Mobiliário escolar|mobiliário escolar|carteira|mesa de refeitório',
        'Mobiliário hospitalar|mobiliário hospitalar|mobiliário de saúde',
        'Mobiliário para biblioteca|mobiliário de biblioteca|estante de biblioteca',
        'Camas e beliches|beliche|cama|colchão',
      ],
    ],
    [
      'Utensílios e copa',
      [
        'Copa e cozinha|copa|geladeira|fogão|bebedouro',
        'Cortinas e persianas|cortina|persiana|toldo',
        'Colchões e enxoval|colchão|enxoval|roupa de cama',
      ],
    ],
  ],
  'uniformes-epis': [
    [
      'Uniformes e fardamentos',
      [
        'Uniforme escolar|uniforme escolar|farda escolar|camiseta escolar',
        'Uniforme administrativo|uniforme administrativo|camisa polo|uniforme social',
        'Fardamento de segurança e guarda|fardamento|farda|uniforme de guarda',
        'Jalecos e roupas de saúde|jaleco|pijama cirúrgico|roupa hospitalar',
        'Calçados|calçado|bota|sapato|tênis',
        'Roupas de cama e banho|roupa de cama|toalha|lençol',
      ],
    ],
    [
      'EPIs',
      [
        'Luvas de proteção|luva de proteção|luva de raspa|luva nitrílica',
        'Capacetes e proteção auditiva|capacete|protetor auricular|abafador',
        'Botas e calçados de segurança|bota de segurança|calçado de segurança|botina',
        'Óculos e máscaras de proteção|óculos de proteção|máscara de proteção|respirador',
        'Coletes e sinalização|colete refletivo|colete|sinalização',
        'EPIs em geral|equipamento de proteção individual|EPI|EPIs',
      ],
    ],
    [
      'Equipamentos de proteção coletiva',
      [
        'Sinalização de segurança|sinalização de segurança|placa de sinalização|cone',
        'Extintores|extintor|prevenção de incêndio',
        'Kits de primeiros socorros|primeiros socorros|kit de primeiros socorros',
      ],
    ],
  ],
  'veiculos-pecas': [
    [
      'Aquisição de veículos',
      [
        'Carros e utilitários|aquisição de veículo|automóvel|utilitário|camionete',
        'Ônibus e micro-ônibus|ônibus|micro-ônibus|van',
        'Ambulâncias|ambulância|veículo de saúde',
        'Caminhões|caminhão|caminhão compactador|caminhão pipa',
        'Motocicletas|motocicleta|moto',
        'Máquinas pesadas|máquina pesada|motoniveladora|retroescavadeira|escavadeira',
      ],
    ],
    [
      'Peças e acessórios',
      [
        'Peças automotivas|peça automotiva|autopeça|peças para veículos',
        'Pneus e câmaras|pneu|câmara de ar|recapagem',
        'Baterias automotivas|bateria automotiva|bateria',
        'Filtros e lubrificantes|filtro|óleo lubrificante|lubrificante',
        'Peças de máquinas pesadas|peças para máquinas|peça de máquina pesada',
      ],
    ],
    [
      'Manutenção de frota',
      [
        'Manutenção de veículos|manutenção de veículos|oficina mecânica|manutenção da frota',
        'Funilaria e pintura|funilaria|pintura automotiva|lanternagem',
        'Lavagem e higienização|lavagem de veículos|lavagem automotiva|lava jato',
        'Gestão de frota|gerenciamento de frota|gestão de frota|manutenção preventiva da frota',
        'Guincho e reboque|guincho|reboque|remoção de veículos',
        'Vistoria e emplacamento|vistoria veicular|emplacamento|licenciamento de veículos',
      ],
    ],
    [
      'Locação de veículos',
      [
        'Locação de veículos|locação de veículos|aluguel de veículos',
        'Locação de máquinas e caminhões|locação de caminhão|locação de máquinas',
      ],
    ],
  ],
  'meio-ambiente': [
    [
      'Gestão ambiental',
      [
        'Licenciamento ambiental|licenciamento ambiental|licença ambiental',
        'Estudos e relatórios ambientais|EIA|RIMA|estudo ambiental|relatório ambiental',
        'Educação ambiental|educação ambiental|campanha ambiental',
        'Plano de resíduos|plano de gerenciamento de resíduos|PGRS|plano de saneamento',
      ],
    ],
    [
      'Recuperação e conservação',
      [
        'Recuperação de áreas degradadas|recuperação de áreas degradadas|PRAD|reflorestamento',
        'Viveiros e mudas|viveiro|muda nativa|plantio de árvores',
        'Poda e manejo de árvores|poda|manejo arbóreo|supressão de vegetação',
        'Combate a incêndios florestais|incêndio florestal|brigada florestal',
      ],
    ],
    [
      'Monitoramento e fiscalização',
      [
        'Monitoramento ambiental|monitoramento ambiental|qualidade da água|análise de água',
        'Drones e geoprocessamento|drone|geoprocessamento|sensoriamento remoto',
        'Fiscalização ambiental|fiscalização ambiental|vigilância ambiental',
      ],
    ],
    [
      'Resíduos e reciclagem',
      [
        'Coleta seletiva|coleta seletiva|reciclagem|cooperativa de catadores',
        'Resíduos perigosos|resíduos perigosos|logística reversa|óleo usado',
        'Compostagem|compostagem|biodigestor',
      ],
    ],
  ],
};

function parseItem(raw: string): SegmentItem {
  const [label = '', ...aliases] = raw.split('|');
  const terms = [...new Set([...aliases, label].map((term) => term.trim()).filter(Boolean))];
  // O primeiro texto após o nome costuma ser o termo mais específico: o nome só vira termo se
  // não houver sinônimos (evita buscar "Hortifrúti" por extenso quando "frutas" é o que aparece).
  return {
    label: label.trim(),
    terms: aliases.length ? terms.filter((t) => t !== label.trim()) : terms,
  };
}

function buildCatalog(): readonly SegmentDefinition[] {
  const list: SegmentDefinition[] = [];
  for (const [niche, segments] of Object.entries(RAW)) {
    for (const [label, rawItems] of segments) {
      const items = rawItems.map(parseItem);
      const terms = [...new Set(items.flatMap((item) => item.terms))];
      list.push({ code: `${niche}/${slug(label)}`, niche, label, items, terms });
    }
  }
  return list;
}

export const SEGMENT_CATALOG: readonly SegmentDefinition[] = buildCatalog();
export const SEGMENT_CODES: readonly string[] = SEGMENT_CATALOG.map((segment) => segment.code);

export function isSegmentCode(value: string): boolean {
  return SEGMENT_CODES.includes(value);
}

export function segmentsOfNiches(niches: readonly string[]): SegmentDefinition[] {
  const wanted = new Set(niches);
  return SEGMENT_CATALOG.filter((segment) => wanted.has(segment.niche));
}

export function segmentDefinitions(codes: readonly string[]): SegmentDefinition[] {
  const wanted = new Set(codes);
  return SEGMENT_CATALOG.filter((segment) => wanted.has(segment.code));
}

/** Só aceita códigos que existem, sem repetição, no máximo 12. */
export function normalizeSegmentCodes(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(isSegmentCode))].slice(0, 12);
}

const quote = (term: string): string => `"${term.replaceAll('"', '').trim()}"`;

/** Expressão `a OR b` (aspas = frase) para o `websearch_to_tsquery`. */
export function termsExpression(terms: readonly string[]): string {
  return [...new Set(terms.map((term) => term.trim()).filter((term) => term.length >= 2))]
    .map(quote)
    .join(' OR ');
}

export function segmentSearchExpression(codes: readonly string[]): string {
  return termsExpression(segmentDefinitions(codes).flatMap((segment) => segment.terms));
}

/**
 * Produtos/serviços: o que bate com o nome de um item do catálogo usa os termos dele; o que foi
 * digitado livremente vale como a própria frase.
 */
export function itemTerms(values: readonly string[]): string[] {
  const byLabel = new Map<string, readonly string[]>();
  for (const segment of SEGMENT_CATALOG) {
    for (const item of segment.items) byLabel.set(item.label.toLowerCase(), item.terms);
  }
  return values.flatMap((value) => byLabel.get(value.trim().toLowerCase()) ?? [value.trim()]);
}

export function itemSearchExpression(values: readonly string[]): string {
  return termsExpression(itemTerms(values));
}
