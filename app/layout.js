import './globals.css';
import './themes.css';
import SeaBg from '../components/SeaBg.js';

// 預設外觀是宣紙；?theme=classic 可切回原版（會記在這個瀏覽器）
const THEME_BOOT = `(function(){try{var ok=['xuan','modai','qingshan','zhuyin','classic'];var q=new URLSearchParams(location.search).get('theme');if(q&&ok.indexOf(q)>-1)localStorage.setItem('jy-theme',q);var t=localStorage.getItem('jy-theme');if(!t||ok.indexOf(t)<0)t='xuan';if(t!=='classic')document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme='xuan'}})()`;

export const metadata = {
  title: '疆域骰戰',
  description: '兩人連線的回合制擲骰征服遊戲',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#141a1f',
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-Hant" suppressHydrationWarning>
      <head>
        {/* 在畫面出現前套用主題（網址 ?theme=xuan，或上次選的），避免閃一下原版的樣子 */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@700;900&family=IBM+Plex+Mono:wght@500;600&display=swap"
        />
      </head>
      <body>
        <SeaBg />
        {children}
      </body>
    </html>
  );
}
