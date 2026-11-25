import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SvgUri } from 'react-native-svg';

type Country = { name: string; flag: string; capital?: string };
type PlayerScore = { name: string; score: number };
type Mode = 'flags' | 'capitals';
type GameValue = {
  countries: Country[]; country: Country | null; score: number; player: string; mode: Mode;
  seconds: number; guessText: string; options: string[]; hintLetters: number[]; leaderboard: PlayerScore[];
  loading: boolean; error: string; started: boolean; feedback: string; feedbackGood: boolean;
  setPlayer: (value: string) => void; setMode: (value: Mode) => void; setGuessText: (value: string) => void;
  start: () => void; guess: (answer: string) => void; nextCountry: () => void; hint: () => void; endGame: () => void;
};

const GameContext = createContext<GameValue | null>(null);
const FLAG_API = 'https://countriesnow.space/api/v0.1/countries/flag/images';
const CAPITAL_API = 'https://countriesnow.space/api/v0.1/countries/capital';
const SCORE_KEY = 'banderas-ranking-v1';
const norm = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
const randomOf = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];
const pngFlagUrl = (flagUrl: string) => {
  try {
    const fileName = decodeURIComponent(flagUrl.split('/').pop() || '');
    if (!fileName.toLowerCase().endsWith('.svg')) return flagUrl;
    return `https://commons.wikimedia.org/w/thumb.php?f=${encodeURIComponent(fileName)}&w=320`;
  } catch {
    return flagUrl;
  }
};

function GameProvider({ children }: React.PropsWithChildren) {
  const [countries, setCountries] = useState<Country[]>([]);
  const [country, setCountry] = useState<Country | null>(null);
  const [score, setScore] = useState(0);
  const [player, setPlayer] = useState('');
  const [mode, setMode] = useState<Mode>('flags');
  const [seconds, setSeconds] = useState(15);
  const [guessText, setGuessText] = useState('');
  const [options, setOptions] = useState<string[]>([]);
  const [hintLetters, setHintLetters] = useState<number[]>([]);
  const [leaderboard, setLeaderboard] = useState<PlayerScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [started, setStarted] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [feedbackGood, setFeedbackGood] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch(FLAG_API).then((r) => { if (!r.ok) throw new Error('No se pudieron cargar las banderas.'); return r.json(); }),
      fetch(CAPITAL_API).then((r) => { if (!r.ok) throw new Error('No se pudieron cargar las capitales.'); return r.json(); }),
      AsyncStorage.getItem(SCORE_KEY),
    ]).then(([flagsResponse, capitalsResponse, saved]) => {
      if (!active) return;
      const capitals = new Map<string, string>((capitalsResponse.data ?? []).map((item: any) => [norm(item.name), item.capital]));
      const merged: Country[] = (flagsResponse.data ?? []).filter((item: any) => item.name && item.flag)
        .map((item: any) => ({ name: item.name.trim(), flag: item.flag, capital: capitals.get(norm(item.name)) }))
        .filter((item: Country) => item.capital);
      if (merged.length < 4) throw new Error('La API devolvió pocos países para jugar.');
      setCountries(merged);
      setCountry(randomOf(merged));
      setLeaderboard(saved ? JSON.parse(saved) : []);
    }).catch((reason) => { if (active) setError(reason?.message || 'No pudimos conectar con CountriesNow. Revisá tu conexión e intentá de nuevo.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!started || !country) return;
    const tick = setInterval(() => setSeconds((value) => {
      if (value <= 1) { setFeedback('¡Se acabó el tiempo! La respuesta era ' + country.name + '.'); setFeedbackGood(false); setTimeout(() => nextCountry(), 900); return 0; }
      return value - 1;
    }), 1000);
    return () => clearInterval(tick);
  }, [started, country]);

  useEffect(() => {
    if (!country || mode !== 'capitals' || !started) return;
    const distractors = countries.filter((item) => item.name !== country.name && item.capital).map((item) => item.capital as string);
    const choices = [country.capital as string, ...distractors.sort(() => Math.random() - 0.5).slice(0, 2)].sort(() => Math.random() - 0.5);
    setOptions(choices);
  }, [country, mode, started, countries]);

  useEffect(() => {
    if (!started || mode !== 'capitals' || !country) return;
    const elapsed = 15 - seconds;
    if (elapsed > 0 && elapsed % 5 === 0) setOptions((items) => items.length > 1 ? items.filter((item) => item === country.capital || Math.random() > 0.5) : items);
  }, [seconds, started, mode, country]);

  const nextCountry = () => {
    if (!countries.length) return;
    const pool = countries.filter((item) => item.name !== country?.name);
    setCountry(randomOf(pool.length ? pool : countries)); setSeconds(15); setHintLetters([]); setGuessText(''); setFeedback('');
  };
  const saveScore = (nextScore: number) => {
    setLeaderboard((previous) => {
      const updated = [...previous.filter((entry) => norm(entry.name) !== norm(player)), { name: player.trim(), score: nextScore }]
        .sort((a, b) => b.score - a.score).slice(0, 10);
      AsyncStorage.setItem(SCORE_KEY, JSON.stringify(updated)).catch(() => setError('No se pudo guardar el ranking en este dispositivo.'));
      return updated;
    });
  };
  const guess = (answer: string) => {
    if (!country || !started || !answer.trim()) return;
    const correct = mode === 'flags' ? norm(answer) === norm(country.name) : norm(answer) === norm(country.capital || '');
    if (correct) {
      const gain = 10 + seconds; const total = score + gain; setScore(total); saveScore(total);
      setFeedback(`¡Correcto! +${gain} puntos`); setFeedbackGood(true); setTimeout(() => nextCountry(), 800);
    } else {
      const total = score - 1; setScore(total); saveScore(total); setFeedback(mode === 'flags' ? 'No era ese país. −1 punto' : 'Esa capital no es correcta. −1 punto'); setFeedbackGood(false);
    }
    setGuessText('');
  };
  const hint = () => {
    if (!country || !started || seconds <= 2) return;
    if (mode === 'capitals') {
      setSeconds((value) => Math.max(0, value - 2));
      setOptions((items) => items.filter((item) => item === country.capital || Math.random() > 0.5));
      setFeedback('Pista: quitamos una opción. −2 segundos'); setFeedbackGood(false); return;
    }
    const indexes = country.name.split('').map((char, index) => char !== ' ' && !hintLetters.includes(index) ? index : -1).filter((index) => index >= 0);
    if (!indexes.length) return;
    setHintLetters((items) => [...items, randomOf(indexes)]); setSeconds((value) => Math.max(0, value - 2));
  };
  const endGame = () => { if (started) saveScore(score); setStarted(false); setSeconds(15); setFeedback(''); };
  const value = useMemo(() => ({ countries, country, score, player, mode, seconds, guessText, options, hintLetters, leaderboard, loading, error, started, feedback, feedbackGood, setPlayer, setMode, setGuessText, start: () => { setScore(0); setSeconds(15); setFeedback(''); setStarted(true); }, guess, nextCountry, hint, endGame }), [countries, country, score, player, mode, seconds, guessText, options, hintLetters, leaderboard, loading, error, started, feedback, feedbackGood]);
  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

function useGame() { const value = useContext(GameContext); if (!value) throw new Error('GameProvider is missing'); return value; }

function Header() { const { score, seconds, endGame, started } = useGame(); return <View style={styles.topbar}><View><Text style={styles.brand}>ATLAS<Text style={styles.brandDot}>.</Text></Text><Text style={styles.eyebrow}>TRIVIA DE BANDERAS</Text></View>{started ? <View style={styles.topStats}><Text style={styles.topPoints}>{score} pts</Text><View style={[styles.timerPill, seconds <= 5 && styles.timerUrgent]}><Text style={styles.timerText}>◷ {seconds}s</Text></View><Pressable onPress={endGame} style={styles.exitButton}><Text style={styles.exitText}>Salir</Text></Pressable></View> : <Text style={styles.tag}>MUNDO · CULTURA · JUEGO</Text>}</View>; }
function ScoreBoard() { const { score, player } = useGame(); return <View style={styles.scoreCard}><View><Text style={styles.miniLabel}>JUGADOR</Text><Text style={styles.playerName}>{player}</Text></View><View style={styles.scoreDivider}/><View style={styles.scoreRight}><Text style={styles.miniLabel}>PUNTAJE</Text><Text style={styles.scoreNumber}>{score}<Text style={styles.scoreUnit}> pts</Text></Text></View></View>; }
function Flag() { const { country, mode, hintLetters } = useGame(); const [imageStage, setImageStage] = useState<'png' | 'svg' | 'failed'>('png'); useEffect(() => setImageStage('png'), [country?.flag]); if (!country) return null; return <View style={styles.flagCard}><View style={styles.flagHeading}><Text style={styles.flagLabel}>{mode === 'flags' ? '¿DE QUÉ PAÍS ES?' : '¿CUÁL ES SU CAPITAL?'}</Text><Text style={styles.roundTag}>RONDA</Text></View><View style={styles.flagImage}>{imageStage === 'png' ? <Image source={{ uri: pngFlagUrl(country.flag) }} style={{ height: 154, width: '100%' }} resizeMode="contain" onError={() => setImageStage('svg')}/> : imageStage === 'svg' ? <SvgUri uri={country.flag} width="100%" height="100%" onError={() => setImageStage('failed')}/> : <Text style={styles.flagLoadError}>No se pudo cargar la bandera. Revisá la conexión.</Text>}</View><View style={styles.flagCaption}><Text style={styles.flagCountry}>{mode === 'flags' ? 'Bandera misteriosa' : country.name}</Text><Text style={styles.flagSub}>{mode === 'flags' ? 'Observá los colores y los símbolos' : 'Elegí la capital correcta'}</Text></View>{mode === 'flags' && hintLetters.length > 0 && <Text style={styles.hintWord}>{country.name.split('').map((letter, i) => letter === ' ' ? '   ' : hintLetters.includes(i) ? letter.toUpperCase() : '＿').join('  ')}</Text>}</View>; }
function GuessForm() { const { mode, options, guessText, setGuessText, guess, hint, seconds } = useGame(); return <View style={styles.formCard}>{mode === 'flags' ? <><Text style={styles.inputLabel}>TU RESPUESTA</Text><View style={styles.inputRow}><TextInput value={guessText} onChangeText={setGuessText} onSubmitEditing={() => guess(guessText)} placeholder="Escribí un país..." placeholderTextColor="#8b929f" style={styles.input} autoCapitalize="words" returnKeyType="send"/><Pressable onPress={() => guess(guessText)} style={styles.sendButton}><Text style={styles.sendText}>→</Text></Pressable></View></> : <View style={styles.optionsWrap}>{options.map((option) => <Pressable key={option} onPress={() => guess(option)} style={styles.option}><Text style={styles.optionText}>{option}</Text><Text style={styles.optionArrow}>↗</Text></Pressable>)}</View>}<View style={styles.formBottom}><Text style={styles.quickTip}>+10 por acierto · −1 por error</Text><Pressable disabled={seconds <= 2} onPress={hint} style={[styles.hintButton, seconds <= 2 && styles.disabled]}><Text style={styles.hintText}>✦  Pista · −2s</Text></Pressable></View></View>; }
function ModePicker() { const { mode, setMode } = useGame(); return <View style={styles.modePicker}><Pressable style={[styles.modeButton, mode === 'flags' && styles.modeSelected]} onPress={() => setMode('flags')}><Text style={[styles.modeText, mode === 'flags' && styles.modeTextSelected]}>⚑  Banderas</Text></Pressable><Pressable style={[styles.modeButton, mode === 'capitals' && styles.modeSelected]} onPress={() => setMode('capitals')}><Text style={[styles.modeText, mode === 'capitals' && styles.modeTextSelected]}>◎  Capitales</Text></Pressable></View>; }
function Leaderboard() { const { leaderboard, player } = useGame(); return <View style={styles.leaderCard}><View style={styles.leaderHeader}><View><Text style={styles.sectionTitle}>Tabla de posiciones</Text><Text style={styles.sectionSub}>Tu progreso queda guardado en este dispositivo</Text></View><Text style={styles.trophy}>♛</Text></View>{leaderboard.length ? leaderboard.slice(0, 5).map((entry, index) => <View key={entry.name} style={styles.leaderRow}><Text style={[styles.rank, index === 0 && styles.firstRank]}>{String(index + 1).padStart(2, '0')}</Text><Text style={[styles.leaderName, norm(entry.name) === norm(player) && styles.currentPlayer]}>{entry.name}{norm(entry.name) === norm(player) ? '  (vos)' : ''}</Text><Text style={styles.leaderPoints}>{entry.score} pts</Text></View>) : <Text style={styles.emptyLeader}>Todavía no hay partidas. ¡Inaugurá el ranking!</Text>}</View>; }
function SetupScreen() { const { player, setPlayer, mode, start, loading, error } = useGame(); return <View style={styles.setupCard}><View style={styles.globe}><Text style={styles.globeEmoji}>🌎</Text></View><Text style={styles.setupEyebrow}>¿LISTO PARA DESAFIAR AL MUNDO?</Text><Text style={styles.setupTitle}>Poné a prueba{ '\n' }tu geografía.</Text><Text style={styles.setupCopy}>Adiviná países por sus banderas y sumá puntos antes de que se termine el tiempo.</Text><Text style={styles.inputLabel}>¿CÓMO TE LLAMÁS?</Text><TextInput value={player} onChangeText={setPlayer} placeholder="Tu nombre" placeholderTextColor="#8b929f" style={styles.nameInput} maxLength={18} autoCapitalize="words"/><ModePicker/>{error ? <Text style={styles.errorText}>{error}</Text> : null}<Pressable onPress={start} disabled={loading || !player.trim()} style={[styles.startButton, (loading || !player.trim()) && styles.disabled]}>{loading ? <ActivityIndicator color="#fff"/> : <Text style={styles.startText}>EMPEZAR A JUGAR   →</Text>}</Pressable><Text style={styles.setupFoot}>15 SEGUNDOS POR RONDA · LAS PISTAS RESTAN TIEMPO</Text></View>; }
function GameScreen() { const { started, country, loading, error, feedback, feedbackGood } = useGame(); if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#f2b84b"/><Text style={styles.loadingText}>Cargando países y banderas…</Text></View>; if (error && !country) return <View style={styles.setupCard}><Text style={styles.errorText}>{error}</Text><Text style={styles.flagSub}>Verificá tu conexión e iniciá de nuevo.</Text></View>; return <>{started ? <><ScoreBoard/><Flag/>{feedback ? <Text style={[styles.feedback, feedbackGood ? styles.good : styles.bad]}>{feedback}</Text> : null}<GuessForm/><Text style={styles.roundNote}>CADA RESPUESTA CORRECTA TE LLEVA A UNA NUEVA RONDA</Text></> : <SetupScreen/>}</>; }
function AppContent() { const { started } = useGame(); return <SafeAreaView style={styles.safe}><StatusBar barStyle="light-content"/><View style={styles.backgroundGlow}/><Header/><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">{started ? <GameScreen/> : <><GameScreen/><Leaderboard/></>}</ScrollView><View style={styles.footer}><Text style={styles.footerText}>HECHO PARA EXPLORAR  <Text style={styles.footerAccent}>✦</Text>  COUNTRIESNOW API</Text></View></SafeAreaView>; }
export default function App() { return <GameProvider><AppContent/></GameProvider>; }

const styles = StyleSheet.create({ safe:{flex:1,backgroundColor:'#11131a'}, backgroundGlow:{position:'absolute',width:280,height:280,borderRadius:150,backgroundColor:'#a56a1518',top:90,right:-125}, topbar:{height:76,paddingHorizontal:22,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderBottomWidth:1,borderBottomColor:'#ffffff12'}, brand:{fontSize:23,fontWeight:'900',letterSpacing:2,color:'#f4f2ed'},brandDot:{color:'#f2b84b'},eyebrow:{fontSize:8,fontWeight:'800',letterSpacing:2.4,color:'#8e929e',marginTop:1},tag:{fontSize:8,letterSpacing:1.1,color:'#777d8a'},topStats:{flexDirection:'row',alignItems:'center',gap:9},topPoints:{color:'#f3c96b',fontSize:13,fontWeight:'800'},timerPill:{backgroundColor:'#292b33',borderRadius:20,paddingHorizontal:11,paddingVertical:7},timerUrgent:{backgroundColor:'#592c31'},timerText:{color:'#f5f2eb',fontSize:12,fontWeight:'800'},exitButton:{padding:8},exitText:{color:'#a5a8b0',fontSize:12},content:{padding:18,paddingBottom:24,maxWidth:600,width:'100%',alignSelf:'center'},scoreCard:{backgroundColor:'#1b1e27',borderRadius:14,borderWidth:1,borderColor:'#ffffff0d',padding:15,flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:13},miniLabel:{fontSize:8,letterSpacing:1.7,color:'#89909b',fontWeight:'800'},playerName:{fontSize:16,color:'#f6f3ec',fontWeight:'700',marginTop:4},scoreDivider:{height:32,width:1,backgroundColor:'#ffffff1b',marginLeft:'auto',marginRight:17},scoreRight:{alignItems:'flex-end'},scoreNumber:{color:'#f2c563',fontSize:23,fontWeight:'900',marginTop:0},scoreUnit:{color:'#aa925f',fontSize:11,fontWeight:'600'},flagCard:{backgroundColor:'#f0eee8',borderRadius:16,padding:14,marginBottom:13,overflow:'hidden'},flagHeading:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:12},flagLabel:{color:'#555b64',fontSize:9,fontWeight:'900',letterSpacing:1.5},roundTag:{backgroundColor:'#e4e1da',paddingHorizontal:8,paddingVertical:4,borderRadius:8,color:'#71747a',fontSize:8,fontWeight:'800'},flagImage:{height:154,width:'100%',backgroundColor:'#e3e1dc',borderRadius:9,alignItems:'center',justifyContent:'center'},flagLoadError:{color:'#777d85',fontSize:11,textAlign:'center',padding:16},flagCaption:{paddingTop:11,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},flagCountry:{fontSize:14,fontWeight:'800',color:'#282c34'},flagSub:{fontSize:10,color:'#777d85'},hintWord:{textAlign:'center',marginTop:10,color:'#323842',fontSize:16,fontWeight:'900',letterSpacing:1},formCard:{backgroundColor:'#1b1e27',borderRadius:14,padding:14,borderWidth:1,borderColor:'#ffffff0d'},inputLabel:{color:'#a0a3aa',fontSize:8,fontWeight:'900',letterSpacing:1.5,marginBottom:8},inputRow:{flexDirection:'row',gap:8},input:{flex:1,height:45,backgroundColor:'#252832',borderRadius:9,paddingHorizontal:13,color:'#f4f2ed',fontSize:13},sendButton:{height:45,width:48,alignItems:'center',justifyContent:'center',backgroundColor:'#e7ad45',borderRadius:9},sendText:{fontSize:22,color:'#1a1b20',fontWeight:'800'},formBottom:{marginTop:12,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},quickTip:{fontSize:9,color:'#8d929d'},hintButton:{backgroundColor:'#302b20',paddingHorizontal:11,paddingVertical:8,borderRadius:8},hintText:{fontSize:9,color:'#ecc266',fontWeight:'800'},disabled:{opacity:.45},feedback:{marginBottom:9,textAlign:'center',fontSize:12,fontWeight:'800'},good:{color:'#83d6a4'},bad:{color:'#f09487'},roundNote:{textAlign:'center',color:'#656b76',fontSize:8,fontWeight:'800',letterSpacing:1.1,marginTop:14},setupCard:{backgroundColor:'#1b1e27',padding:20,borderRadius:18,borderWidth:1,borderColor:'#ffffff12',alignItems:'stretch',marginTop:4},globe:{height:59,width:59,borderRadius:32,backgroundColor:'#332b1c',alignItems:'center',justifyContent:'center',alignSelf:'center',marginBottom:15},globeEmoji:{fontSize:30},setupEyebrow:{textAlign:'center',color:'#e5b957',fontSize:8,fontWeight:'900',letterSpacing:1.6},setupTitle:{textAlign:'center',color:'#f5f1e8',fontSize:29,lineHeight:33,fontWeight:'900',marginTop:8},setupCopy:{textAlign:'center',color:'#a1a4ad',fontSize:12,lineHeight:19,marginTop:9,marginBottom:20},nameInput:{height:45,backgroundColor:'#252832',borderRadius:9,paddingHorizontal:13,color:'#f4f2ed',fontSize:13,marginBottom:12},modePicker:{flexDirection:'row',backgroundColor:'#14161d',padding:4,borderRadius:10,marginBottom:14},modeButton:{flex:1,alignItems:'center',paddingVertical:10,borderRadius:7},modeSelected:{backgroundColor:'#e7ad45'},modeText:{color:'#a5a8b0',fontSize:11,fontWeight:'800'},modeTextSelected:{color:'#1c1d22'},startButton:{height:48,backgroundColor:'#e7ad45',borderRadius:9,alignItems:'center',justifyContent:'center'},startText:{color:'#211d16',fontSize:11,fontWeight:'900',letterSpacing:.6},setupFoot:{textAlign:'center',fontSize:7,color:'#797e89',letterSpacing:1,marginTop:13},leaderCard:{backgroundColor:'#1b1e27',padding:15,borderRadius:14,borderWidth:1,borderColor:'#ffffff0d',marginTop:14},leaderHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:10},sectionTitle:{color:'#f2efe9',fontSize:13,fontWeight:'800'},sectionSub:{color:'#838995',fontSize:9,marginTop:3},trophy:{color:'#e5b957',fontSize:21},leaderRow:{height:36,flexDirection:'row',alignItems:'center',borderTopWidth:1,borderTopColor:'#ffffff0c'},rank:{width:33,color:'#808591',fontSize:10,fontWeight:'900'},firstRank:{color:'#e7b848'},leaderName:{flex:1,color:'#d7d8da',fontSize:11,fontWeight:'600'},currentPlayer:{color:'#f0c45d'},leaderPoints:{color:'#e9c36a',fontSize:10,fontWeight:'800'},emptyLeader:{color:'#868b96',fontSize:10,paddingVertical:9},center:{paddingVertical:70,alignItems:'center',gap:12},loadingText:{color:'#a4a8b0',fontSize:12},errorText:{color:'#ff9b8e',fontSize:12,textAlign:'center',marginBottom:12},optionsWrap:{gap:8},option:{height:43,paddingHorizontal:12,borderRadius:9,backgroundColor:'#252832',flexDirection:'row',alignItems:'center',justifyContent:'space-between'},optionText:{color:'#efede8',fontSize:12,fontWeight:'700'},optionArrow:{color:'#e7b34f'},footer:{height:34,borderTopWidth:1,borderTopColor:'#ffffff10',alignItems:'center',justifyContent:'center'},footerText:{fontSize:7,color:'#737985',letterSpacing:1.1,fontWeight:'800'},footerAccent:{color:'#e7b34f'} });
