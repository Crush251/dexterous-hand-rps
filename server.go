package main

import (
	"embed"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"mime"
	"net/http"
	"path/filepath"
)

//go:embed 1.detect-hand-shape 2.detect-hand-rps 3.output-event 4.follow-me 5.always-win 6.gameplay index.html
var content embed.FS

func main() {
	// 命令行参数：端口号
	port := flag.Int("port", 8080, "服务器端口号")
	flag.Parse()

	// 注册额外的 MIME 类型
	mime.AddExtensionType(".js", "application/javascript")
	mime.AddExtensionType(".wasm", "application/wasm")
	mime.AddExtensionType(".tflite", "application/octet-stream")
	mime.AddExtensionType(".binarypb", "application/octet-stream")

	// 创建文件服务器
	fsys, err := fs.Sub(content, ".")
	if err != nil {
		log.Fatal(err)
	}

	// 自定义文件服务器，添加正确的 MIME 类型
	fileServer := http.FileServer(http.FS(fsys))

	// 包装文件服务器，添加日志和 MIME 类型处理
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// 记录请求
		log.Printf("%s %s", r.Method, r.URL.Path)

		// 根据文件扩展名设置正确的 Content-Type
		ext := filepath.Ext(r.URL.Path)
		switch ext {
		case ".js":
			w.Header().Set("Content-Type", "application/javascript; charset=utf-8")
		case ".wasm":
			w.Header().Set("Content-Type", "application/wasm")
		case ".tflite":
			w.Header().Set("Content-Type", "application/octet-stream")
		case ".binarypb":
			w.Header().Set("Content-Type", "application/octet-stream")
		case ".data":
			w.Header().Set("Content-Type", "application/octet-stream")
		case ".css":
			w.Header().Set("Content-Type", "text/css; charset=utf-8")
		case ".html":
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
		}

		// 提供文件
		fileServer.ServeHTTP(w, r)
	})

	// 启动服务器
	addr := fmt.Sprintf(":%d", *port)
	log.Printf("🚀 灵巧手剪刀石头布游戏服务器启动")
	log.Printf("📡 监听地址: http://localhost%s", addr)
	log.Printf("🌐 访问主页: http://localhost%s/", addr)
	log.Printf("💡 提示: 按 Ctrl+C 停止服务器")
	log.Printf("")
	log.Printf("📂 可用页面:")
	log.Printf("   - http://localhost%s/              (主页)")
	log.Printf("   - http://localhost%s/1.detect-hand-shape/", addr)
	log.Printf("   - http://localhost%s/2.detect-hand-rps/", addr)
	log.Printf("   - http://localhost%s/3.output-event/", addr)
	log.Printf("   - http://localhost%s/4.follow-me/", addr)
	log.Printf("   - http://localhost%s/5.always-win/", addr)
	log.Printf("   - http://localhost%s/6.gameplay/", addr)
	log.Printf("")

	if err := http.ListenAndServe(addr, nil); err != nil {
		log.Fatal(err)
	}
}
