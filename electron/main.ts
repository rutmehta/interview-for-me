import { app, BrowserWindow, ipcMain, globalShortcut } from "electron"
import { initializeIpcHandlers } from "./ipcHandlers"
import { WindowHelper } from "./WindowHelper"
import { ScreenshotHelper } from "./ScreenshotHelper"
import { ShortcutsHelper } from "./shortcuts"
import { ProcessingHelper } from "./ProcessingHelper"
import { desktopCapturer } from 'electron'
import * as path from 'path'
import * as fs from 'fs-extra'

export class AppState {
  private static instance: AppState | null = null

  private windowHelper: WindowHelper
  private screenshotHelper: ScreenshotHelper
  public shortcutsHelper: ShortcutsHelper
  public processingHelper: ProcessingHelper

  // View management
  private view: "queue" | "solutions" = "queue"

  private problemInfo: {
    problem_statement: string
    input_format: Record<string, any>
    output_format: Record<string, any>
    constraints: Array<Record<string, any>>
    test_cases: Array<Record<string, any>>
  } | null = null // Allow null

  private hasDebugged: boolean = false

  // Processing events
  public readonly PROCESSING_EVENTS = {
    //global states
    UNAUTHORIZED: "procesing-unauthorized",
    NO_SCREENSHOTS: "processing-no-screenshots",

    //states for generating the initial solution
    INITIAL_START: "initial-start",
    PROBLEM_EXTRACTED: "problem-extracted",
    SOLUTION_SUCCESS: "solution-success",
    INITIAL_SOLUTION_ERROR: "solution-error",

    //states for processing the debugging
    DEBUG_START: "debug-start",
    DEBUG_SUCCESS: "debug-success",
    DEBUG_ERROR: "debug-error"
  } as const

  private isRecording: boolean = false
  private audioFilePath: string | null = null
  private mediaRecorder: any = null
  private chunks: Blob[] = []

  constructor() {
    // Initialize WindowHelper with this
    this.windowHelper = new WindowHelper(this)

    // Initialize ScreenshotHelper
    this.screenshotHelper = new ScreenshotHelper(this.view)

    // Initialize ProcessingHelper
    this.processingHelper = new ProcessingHelper(this)

    // Initialize ShortcutsHelper
    this.shortcutsHelper = new ShortcutsHelper(this)
  }

  public static getInstance(): AppState {
    if (!AppState.instance) {
      AppState.instance = new AppState()
    }
    return AppState.instance
  }

  // Getters and Setters
  public getMainWindow(): BrowserWindow | null {
    return this.windowHelper.getMainWindow()
  }

  public getView(): "queue" | "solutions" {
    return this.view
  }

  public setView(view: "queue" | "solutions"): void {
    this.view = view
    this.screenshotHelper.setView(view)
  }

  public isVisible(): boolean {
    return this.windowHelper.isVisible()
  }

  public getScreenshotHelper(): ScreenshotHelper {
    return this.screenshotHelper
  }

  public getProblemInfo(): any {
    return this.problemInfo
  }

  public setProblemInfo(problemInfo: any): void {
    this.problemInfo = problemInfo
  }

  public getScreenshotQueue(): string[] {
    return this.screenshotHelper.getScreenshotQueue()
  }

  public getExtraScreenshotQueue(): string[] {
    return this.screenshotHelper.getExtraScreenshotQueue()
  }

  // Window management methods
  public createWindow(): void {
    this.windowHelper.createWindow()

    // Register global shortcuts for audio recording
    globalShortcut.register('CommandOrControl+Shift+R', () => {
      console.log('Starting audio recording via shortcut');
      const mainWindow = this.getMainWindow();
      if (mainWindow) {
        this.startAudioRecording().then(result => {
          if (result.success) {
            // Flash window briefly to indicate recording started (optional)
            mainWindow.flashFrame(true);
            setTimeout(() => mainWindow.flashFrame(false), 200);
          }
        });
      }
    });

    globalShortcut.register('CommandOrControl+Shift+S', () => {
      console.log('Stopping audio recording via shortcut');
      const mainWindow = this.getMainWindow();
      if (mainWindow) {
        this.stopAudioRecording().then(result => {
          if (result.success) {
            // Flash window briefly to indicate recording stopped (optional)
            mainWindow.flashFrame(true);
            setTimeout(() => mainWindow.flashFrame(false), 200);
          }
        });
      }
    });

    ipcMain.handle('start-audio-recording', async () => {
      return this.startAudioRecording();
    });

    ipcMain.handle('stop-audio-recording', async () => {
      return this.stopAudioRecording();
    });
    
    // Handler for saving audio files from renderer process
    ipcMain.handle('save-audio-file', async (event, data: { path: string, buffer: Buffer }) => {
      try {
        console.log(`Saving audio file to ${data.path}, size: ${data.buffer.length} bytes`);
        await fs.writeFile(data.path, data.buffer);
        return true;
      } catch (error) {
        console.error('Error saving audio file:', error);
        return false;
      }
    });
  }

  public hideMainWindow(): void {
    this.windowHelper.hideMainWindow()
  }

  public showMainWindow(): void {
    this.windowHelper.showMainWindow()
  }

  public toggleMainWindow(): void {
    console.log(
      "Screenshots: ",
      this.screenshotHelper.getScreenshotQueue().length,
      "Extra screenshots: ",
      this.screenshotHelper.getExtraScreenshotQueue().length
    )
    this.windowHelper.toggleMainWindow()
  }

  public setWindowDimensions(width: number, height: number): void {
    this.windowHelper.setWindowDimensions(width, height)
  }

  public clearQueues(): void {
    this.screenshotHelper.clearQueues()

    // Clear problem info
    this.problemInfo = null

    // Reset view to initial state
    this.setView("queue")
  }

  // Screenshot management methods
  public async takeScreenshot(): Promise<string> {
    if (!this.getMainWindow()) throw new Error("No main window available")

    const screenshotPath = await this.screenshotHelper.takeScreenshot(
      () => this.hideMainWindow(),
      () => this.showMainWindow()
    )

    return screenshotPath
  }

  public async getImagePreview(filepath: string): Promise<string> {
    return this.screenshotHelper.getImagePreview(filepath)
  }

  public async deleteScreenshot(
    path: string
  ): Promise<{ success: boolean; error?: string }> {
    return this.screenshotHelper.deleteScreenshot(path)
  }

  // New methods to move the window
  public moveWindowLeft(): void {
    this.windowHelper.moveWindowLeft()
  }

  public moveWindowRight(): void {
    this.windowHelper.moveWindowRight()
  }
  public moveWindowDown(): void {
    this.windowHelper.moveWindowDown()
  }
  public moveWindowUp(): void {
    this.windowHelper.moveWindowUp()
  }

  public setHasDebugged(value: boolean): void {
    this.hasDebugged = value
  }

  public getHasDebugged(): boolean {
    return this.hasDebugged
  }

  // Helper methods for audio recording
  private async startAudioRecording(): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('Starting audio recording...');
      
      // Set up audio recording directory
      const audioDir = path.join(app.getPath('userData'), 'audio-recordings');
      await fs.ensureDir(audioDir);
      
      // Create a unique filename for this recording
      this.audioFilePath = path.join(audioDir, `recording-${Date.now()}.webm`);
      
      // Get audio sources for desktop capture
      const sources = await desktopCapturer.getSources({ 
        types: ['window', 'screen'] 
      });
      
      // Inform renderer process to start recording
      const mainWindow = this.getMainWindow();
      if (mainWindow) {
        // Send list of sources to renderer for recording
        mainWindow.webContents.send('begin-recording', { 
          sources: sources.map(s => ({ 
            id: s.id, 
            name: s.name,
            thumbnail: s.thumbnail
          })),
          outputPath: this.audioFilePath
        });
        
        // Set recording state
        this.isRecording = true;
        mainWindow.webContents.send('audio-recording-started');
      }
      
      console.log('Audio recording started');
      return { success: true };
    } catch (error) {
      console.error('Failed to start audio recording:', error);
      return { success: false, error: error.message };
    }
  }

  private async stopAudioRecording(): Promise<{ success: boolean; error?: string, data?: any }> {
    if (!this.isRecording || !this.audioFilePath) {
      return { success: false, error: 'No active recording' };
    }
    
    this.isRecording = false;
    
    try {
      // Tell renderer to stop recording
      const mainWindow = this.getMainWindow();
      if (mainWindow) {
        mainWindow.webContents.send('stop-recording');
        mainWindow.webContents.send('audio-recording-stopped');
      }
      
      console.log('Audio recording stopped, waiting for file to be saved...');
      
      // Wait a bit for the file to be saved
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Check if file exists
      if (!await fs.pathExists(this.audioFilePath)) {
        console.error(`Audio file not found at ${this.audioFilePath}`);
        // Create an empty file for testing
        await fs.writeFile(this.audioFilePath, Buffer.from(''));
      }
      
      console.log('Beginning audio processing...');
      
      // Process the audio file for transcription
      const result = await this.processingHelper.processAudioInput(this.audioFilePath);
      this.audioFilePath = null;
      return result;
    } catch (error) {
      console.error('Failed to process audio recording:', error);
      return { success: false, error: error.message };
    }
  }

  // Clean up global shortcuts when app is quitting
  public unregisterShortcuts(): void {
    globalShortcut.unregisterAll();
  }
}

// Application initialization
async function initializeApp() {
  const appState = AppState.getInstance()

  // Initialize IPC handlers before window creation
  initializeIpcHandlers(appState)

  app.whenReady().then(() => {
    console.log("App is ready")
    appState.createWindow()
    // Register global shortcuts using ShortcutsHelper
    appState.shortcutsHelper.registerGlobalShortcuts()
  })

  app.on("activate", () => {
    console.log("App activated")
    if (appState.getMainWindow() === null) {
      appState.createWindow()
    }
  })

  // Quit when all windows are closed, except on macOS
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit()
    }
  })

  app.dock?.hide() // Hide dock icon (optional)
  app.commandLine.appendSwitch("disable-background-timer-throttling")

  app.on("will-quit", () => {
    AppState.getInstance().unregisterShortcuts();
  });
}

// Start the application
initializeApp().catch(console.error)
