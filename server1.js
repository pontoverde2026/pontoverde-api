// 1. Ativação do Cofre (Deve ser a linha 1)
require('dotenv').config();

// --- IMPORTAÇÕES ---
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { createClient } = require('@supabase/supabase-js'); // <-- Injeção do Supabase

const app = express();
app.use(cors());
app.use(express.json());
// Rota de Keep-Alive para evitar que o Render hiberne
app.get('/ping', (req, res) => {
    res.status(200).json({ status: 'ativo', mensagem: 'Servidor acordado' });
});

// --- CONFIGURAÇÃO INICIAL ---
// Conexão Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// Conexão Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Calcula a distância real na superfície da Terra entre duas coordenadas
function calcularDistancia(lat1, lon1, lat2, lon2) {
    const R = 6371; // Raio da Terra em km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// --- ROTA DE INTEGRAÇÃO ---
app.post("/pesquisar", async (req, res) => {
    // Captura o input do usuário vindo do fetch() da barra de pesquisa 
    const { textoUsuario } = req.body; 

    try {
        // 1. Módulo IA: Classificação (Controle em Roxo)
        const systemPrompt = "Classifique em uma palavra: [recicláveis, eletronico, movel, entulho, oleo, lampada]. Responda apenas o JSON: {\"categoria\": \"valor\"}";
        
        // É aqui que mandamos a pergunta de fato para a IA:
        const result = await model.generateContent(`${systemPrompt} \n Item: ${textoUsuario}`);

        const textoIA = result.response.text().replace(/```json|```/g, "").trim();
        const categoriaResposta = JSON.parse(textoIA).categoria;

        console.log(`\n--- NOVA PESQUISA ---`);
        console.log(`Item recebido: ${textoUsuario}`);
        console.log(`Classificação da IA: ${categoriaResposta}`);
        console.log(`---------------------\n`);

        // 2. Módulo de Busca: Filtro Direto na Nuvem (Supabase)
        const { data: locaisProximos, error } = await supabase
            .from('Ecopontos_lorena') 
            .select('*')
            .eq('tipo', categoriaResposta); 


        if (error) throw error; 

        // --- NOVA LÓGICA: CÁLCULO DE DISTÂNCIA E ORDENAÇÃO ---
        let dadosTratados = locaisProximos;

        // Se o frontend enviou as coordenadas lat e lon no corpo da requisição
        if (req.body.lat && req.body.lon) {
            dadosTratados = locaisProximos.map(ponto => {
                const dist = calcularDistancia(
                    req.body.lat, 
                    req.body.lon, 
                    ponto.latitude, 
                    ponto.longitude
                );
                return { ...ponto, distancia_km: dist };
            });

            // Ordena do mais próximo para o mais distante
            dadosTratados.sort((a, b) => a.distancia_km - b.distancia_km);
        }

        // 3. Resposta de Saída (Contrato em Laranja) 
        return res.json({
            "status": "sucesso",
            "mensagem_chat": `O item "${textoUsuario}" foi classificado como ${categoriaResposta}.`,
            "dados_mapa": dadosTratados // Enviamos a lista já ordenada e com as distâncias
        });

    } catch (error) {
        // Retorna onde o Erro Ocorreu
        console.error("\n[ ERRO DETALHADO DO SERVIDOR ]:", error);

        // Fallback se a IA falhar ou o Banco de Dados cair
        return res.status(500).json({ 
            "status": "erro", 
            "mensagem_chat": "Não consegui identificar este resíduo no momento ou houve falha de conexão com a base de dados." 
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor Ponto Verde rodando na porta ${PORT}`));