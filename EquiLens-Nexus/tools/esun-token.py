#!/usr/bin/env python3
# 玉山證券行情 token：用玉山官方行情 SDK（esun_marketdata）登入，換取行情 API 的 token，以一行 JSON 輸出到 stdout。
# 衡析（lib/providers/esun.mjs）在背景呼叫這支程式；之後的行情請求由衡析自己以 X-SDK-TOKEN 標頭送出。
#
# 安全：只呼叫 login() 與取得行情 token／網址，不使用任何下單、改單或帳務功能，也不匯入交易 SDK（esun_trade）。
# 密碼：沿用玉山 SDK 的做法存在系統鑰匙圈（esun_trade_sdk:account／esun_trade_sdk:cert）。
#   第一次請在終端機執行  python3 tools/esun-token.py /路徑/config.ini --setup  依提示輸入登入密碼與憑證密碼；
#   之後衡析在背景執行時不會再詢問（鑰匙圈沒有密碼時直接回報錯誤，不會卡住等待輸入）。
# 輸出：{"ok": true, "token": "...", "rest": "...", "ws": "..."} 或 {"ok": false, "error": "..."}；--setup 時不輸出 token。
import configparser
import json
import os
import sys


def out(obj, code=0):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()
    sys.exit(code)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    setup = "--setup" in sys.argv[1:]
    if len(args) != 1:
        out({"ok": False, "error": "usage: esun-token.py /path/to/config.ini [--setup]"}, 2)
    path = os.path.expanduser(args[0])
    if not os.path.isfile(path):
        out({"ok": False, "error": "config-not-found"}, 1)
    cfg = configparser.ConfigParser()
    try:
        cfg.read(path, encoding="utf-8")
        account = cfg["User"]["Account"].strip()
    except Exception:
        out({"ok": False, "error": "config-invalid"}, 1)

    # 背景執行（沒有終端機）時，鑰匙圈必須已有兩組密碼，否則 SDK 會停在 getpass 等待輸入
    if not setup:
        try:
            import keyring
            if not keyring.get_password("esun_trade_sdk:account", account) or not keyring.get_password("esun_trade_sdk:cert", account):
                out({"ok": False, "error": "password-missing"}, 1)
        except SystemExit:
            raise
        except Exception:
            out({"ok": False, "error": "keyring-unavailable"}, 1)
        # 保險：就算 SDK 仍要求輸入，也立刻失敗而不是卡住
        sys.stdin = open(os.devnull)

    try:
        from esun_marketdata import EsunMarketdata
    except Exception:
        out({"ok": False, "error": "sdk-missing"}, 1)

    try:
        sdk = EsunMarketdata(cfg)
        sdk.login()
    except EOFError:
        out({"ok": False, "error": "password-missing"}, 1)
    except Exception as e:
        out({"ok": False, "error": "login-failed", "detail": str(e)[:300]}, 1)

    if setup:
        out({"ok": True, "setup": True})

    token = None
    try:
        token = sdk.rest_client.options.get("sdk_token")
    except Exception:
        token = None
    if not token:
        try:
            token = sdk.get_sdk_token()
        except Exception as e:
            out({"ok": False, "error": "token-failed", "detail": str(e)[:300]}, 1)
    rest = ws = None
    try:
        rest, ws = sdk.get_marketdata_rest_url(), sdk.get_marketdata_ws_url()
    except Exception:
        pass
    out({"ok": True, "token": token, "rest": rest, "ws": ws})


if __name__ == "__main__":
    main()
